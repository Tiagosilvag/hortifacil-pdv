# NFC-e: escolha entre emissão direta na SEFAZ e provedor — Design

**Data:** 2026-09-26
**Status:** aguardando revisão do usuário
**Estende:** `2026-09-25-nfce-design.md` (C1 a C3, já em `main`). Aquela spec escolheu "provedor de API fiscal"; esta acrescenta o **modo direto** (o sistema fala com a SEFAZ-PE usando o certificado digital A1 da empresa) e a **escolha do modo nas Configurações**.

## 1. Objetivo

Deixar o administrador escolher, em Configurações > Fiscal, como a NFC-e é emitida:

- **SEFAZ direto:** o sistema gera o XML da NFC-e, assina com o certificado A1 e transmite à SEFAZ-PE. Sem mensalidade, mas a manutenção do leiaute passa a ser nossa (este é o modo que o sistema antigo já usava, o "modo normal").
- **Provedor:** uma API HTTP que assina, transmite e trata a contingência (o adaptador é escrito depois, quando houver um provedor escolhido).
- **Nenhum:** emissão desligada (o padrão de hoje).

Tudo que já existe (cupom fiscal na Epson, cancelamento, reenvio automático, trava de produção, telas) continua igual: o resto do sistema só conhece a interface `FiscalProvider`.

Fora do escopo: NF-e modelo 55, NFS-e, SAT, vários CNPJs e a troca da chave mestra dos segredos.

## 2. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Ordem | Base da escolha + **modo direto primeiro**; o adaptador de provedor vira um plano próprio depois |
| Onde fica a escolha | No banco (`fiscal_settings`), pela tela. A variável `FISCAL_PROVIDER` deixa de escolher o modo (só força o provedor falso em desenvolvimento) |
| Segredos | **Cifrados no banco**, cadastrados pela tela; a chave mestra `FISCAL_SECRET_KEY` fica só no Coolify. Nunca voltam ao navegador |
| Provedor | Ainda não escolhido |
| Bibliotecas do modo direto | `nfelib` (XML a partir dos XSD oficiais, atualizada a cada pacote de schemas), `lxml`, `signxml` (assinatura); `cryptography` e `httpx` já existem. **Não** usar a PyNFe: não menciona QR Code v3, IBS/CBS nem as notas técnicas de 2025 |
| Reforma tributária | Regime normal exige o grupo **IBS/CBS por item** (CST, classificação tributária, base e alíquota) na NFC-e. Vale para os **dois modos**; o contador define os valores |

## 3. Arquitetura

- `FiscalProvider` (C1a) continua sendo o contrato: `emit_nfce`, `get_nfce`, `cancel_nfce`.
- `get_provider(settings, secrets)` passa a montar o adaptador a partir do **modo salvo no banco**, não de variável de ambiente.
- Novo adaptador `SefazDireto`, composto pelos módulos de `app/services/fiscal/sefaz/`:

| Módulo | Responsabilidade |
|---|---|
| `certificate.py` | abre o `.pfx` em memória; confere validade e se o CNPJ do certificado é o da empresa |
| `numbering.py` | número (`nNF`) sequencial por série, ambiente e CNPJ, reservado com trava (`SELECT … FOR UPDATE`) |
| `access_key.py` | chave de 44 dígitos e dígito verificador |
| `xml_builder.py` | payload canônico → XML da NFC-e (emitente, itens, ICMS por CST, PIS/COFINS, grupo IBS/CBS, pagamento, QR Code) |
| `signer.py` | assinatura XML-DSig com o certificado A1 |
| `transport.py` | SOAP 1.2 com TLS mútuo; o certificado vai só em arquivos temporários protegidos, apagados na hora |
| `responses.py` | tabela de códigos da SEFAZ (`cStat`) → autorizada, rejeitada, pendente, denegada |
| `events.py` | cancelamento por evento e inutilização de numeração |
| `sefaz_direto.py` | o adaptador `FiscalProvider` que junta tudo |

## 4. Como uma nota é emitida (modo direto)

```
payload canônico → reserva número e chave → XML (nfelib) → valida no XSD → assina (A1)
→ SOAP para a SEFAZ-PE (autorização síncrona) → lê o retorno → EmitResult
```

- **Número e chave são reservados antes de enviar** e gravados no pedido. Com tempo esgotado, "Consultar situação" pergunta à SEFAZ pela **chave**; o reenvio manda o mesmo XML assinado e a SEFAZ responde "duplicidade" com o protocolo, então não sai nota em dobro (o equivalente da idempotência do provedor).
- **Números pulados** (rejeição antes de autorizar, envio perdido) são **inutilizados**: obrigação fiscal, entra no modo direto.
- **XML autorizado** (com o protocolo) fica numa tabela nova e é servido pelo sistema ("Baixar XML"), já que não há URL de provedor.
- **Retornos:** 100 autorizada; 105 em processamento (fica pendente e consulta pela chave); serviço paralisado (108/109) fica pendente com reenvio automático; denegada e rejeições viram `rejected` com o motivo da SEFAZ na tela.
- **IBS/CBS:** o adaptador exige os campos novos por item; produto sem eles fica "pendente" (a regra de "pronto para emitir" do C1 ganha esses campos). O mesmo vale para o modo provedor.
- **Contingência offline** (emitir sem conexão, cupom marcado, transmitir depois) é a última etapa, depois de o modo online funcionar.

## 5. Dados

- **`fiscal_settings`:** `mode` (`none` | `sefaz_direto` | `provider` | `fake`, este só em desenvolvimento) e, quando houver provedor, o nome dele.
- **`fiscal_secrets`** (uma linha por segredo): `kind` (`certificate`, `certificate_password`, `csc_hml`, `csc_prod`, `provider_token`), conteúdo **cifrado** (AES-GCM, chave derivada de `FISCAL_SECRET_KEY`) e metadados **não secretos** (titular, CNPJ, vencimento, impressão digital) para a tela.
- **`fiscal_documents`:** referência do pedido, `nNF`, série, ambiente, chave, XML assinado, XML autorizado (protocolo), situação. Base da idempotência, da consulta e do "Baixar XML".
- **`fiscal_numbering`:** próximo número por (CNPJ, série, ambiente), e as lacunas a inutilizar.
- **Produto, item do pedido e padrão da categoria:** campos de IBS/CBS (CST, classificação tributária, alíquotas conforme a nota técnica), definidos com o contador.

## 6. Telas (Configurações > Fiscal, admin)

- **Modo de emissão:** *Nenhum*, *SEFAZ direto (certificado digital)*, *Provedor* (quando existir adaptador). *Fake* só em desenvolvimento. A trava de produção passa a conferir o modo escolhido.
- **Certificado digital:** upload do `.pfx` e senha. Depois de salvo, a tela mostra só "Certificado de EMPRESA…, válido até 12/2026 (faltam N dias)", com alerta amarelo e vermelho perto do vencimento. Bloqueia senha errada, certificado vencido e CNPJ diferente do da empresa.
- **CSC** (ID e token), separado para homologação e produção.
- **"Testar conexão":** consulta o status do serviço da SEFAZ e mostra "SEFAZ-PE em operação (homologação)".
- **Cofre:** sem `FISCAL_SECRET_KEY` a tela avisa e recusa salvar segredos.
- **Cartão NFC-e do pedido:** "Baixar XML". **Numeração:** lista de lacunas com "Inutilizar".

## 7. Testes

TDD, revisor de contexto novo no fim, como nos sub-projetos anteriores. Nenhum teste chama a SEFAZ nem usa certificado real.

- XML gerado validado no **XSD oficial**.
- **Assinatura** com certificado de teste gerado na hora, verificando a assinatura de volta.
- **Transporte** com respostas gravadas (autorizada, rejeitada, em processamento, duplicidade).
- **Numeração** com concorrência; chave e dígito verificador com exemplos conhecidos.
- **Cofre:** cifra e decifra, nada de segredo em respostas da API, recusa sem chave mestra.
- **SEFAZ real:** só num roteiro manual em **homologação**, com o certificado e o CSC de homologação do usuário.

## 8. Ordem de entrega (um plano por etapa)

1. **E0, base da escolha:** modo no banco, cofre cifrado, `get_provider` lendo do banco, cartões da tela, campos IBS/CBS, trava de produção atualizada. Não depende de nada do usuário.
2. **E1, prova de fogo:** gerar, validar e assinar uma NFC-e **offline** e depois enviá-la à SEFAZ-PE em **homologação**. Resolve o que só o manual oficial esclarece: **endereços dos webservices, fórmula do QR Code v3 (se ainda usa o CSC) e mapeamento do grupo IBS/CBS**. Nada disso será chutado. Precisa do certificado, do CSC de homologação e do credenciamento.
3. **E2, emissão e consulta online** em homologação.
4. **E3, cancelamento por evento e inutilização.**
5. **E4, contingência offline.**
6. **E5, liberação para produção.**
7. **Adaptador de provedor:** plano próprio, depois da escolha do provedor; reaproveita a E0.

A E0 e o código da E2 avançam sem o certificado; só a execução real em homologação depende dos itens do usuário.

## 9. Riscos

- **A manutenção do leiaute é nossa no modo direto** (as notas técnicas da reforma tributária ainda mudam). Mitigação: `nfelib` acompanha os XSD; ter os dois modos permite trocar para o provedor sem refazer nada.
- **Vazamento do certificado:** cifrado, não volta à tela, chave mestra fora do banco e do repositório (público).
- **Número duplicado ou pulado:** reserva com trava e inutilização.
- **Relógio do servidor:** a SEFAZ rejeita data de emissão muito fora da hora.
- **SEFAZ ou internet fora do ar:** nota pendente, reenvio automático e, depois, contingência offline.
- **Rejeição por dado do produto** (NCM, CST, IBS/CBS): a mensagem da SEFAZ vai para a tela.
- **Sem backup do Postgres:** perder o banco perde a numeração e o certificado cifrado. **Configurar backup no Coolify vem antes de ligar produção.**
- **Assinatura RSA-SHA1** exigida pela SEFAZ: confirmar que a `signxml` a aceita (ponto do primeiro teste).

## 10. Pendências do usuário (valem para os dois modos)

1. **Data de vencimento do certificado A1** (o do sistema antigo está em `GestaoFacil/Certificado/`, ignorado pelo Git; nunca é aberto nem copiado para o repositório).
2. **CSC de homologação** na SEFAZ-PE e **credenciamento** da empresa para NFC-e.
3. **Tabela do contador** por categoria, agora **incluindo IBS/CBS**.
4. **Backup do Postgres** no Coolify.
5. Nada de deploy sem o "pode fazer o deploy" explícito do usuário.
