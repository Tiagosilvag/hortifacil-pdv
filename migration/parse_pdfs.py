"""Ponto de entrada: python migration/parse_pdfs.py --customers "Clientes.pdf" "Clientes 2.pdf" --products "Produtos Novo.pdf" """
import sys

from legacy_import.cli import main

if __name__ == "__main__":
    sys.exit(main())
