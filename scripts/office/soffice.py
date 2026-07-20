import sys
import subprocess

def main():
    args = sys.argv[1:]
    try:
        # Run soffice with the arguments passed to the script
        subprocess.run(["soffice"] + args, check=True)
    except FileNotFoundError:
        print("Error: 'soffice' (LibreOffice) command was not found on the system.", file=sys.stderr)
        print("Please install LibreOffice (e.g., 'sudo apt install libreoffice') to convert DOCX to PDF.", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error running soffice: {e}", file=sys.stderr)
        sys.exit(e.returncode)

if __name__ == "__main__":
    main()
