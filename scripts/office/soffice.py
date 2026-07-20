import os
import sys
import subprocess
import shutil
import tempfile

def get_soffice_path():
    # 1. Check SOFFICE_BIN env var
    env_bin = os.environ.get("SOFFICE_BIN")
    if env_bin:
        return env_bin
        
    # 2. Check if soffice is in path
    soffice_path = shutil.which("soffice")
    if soffice_path:
        return soffice_path
        
    # 3. Check WSL Windows fallback path
    wsl_fallback = "/mnt/c/Program Files/LibreOffice/program/soffice.exe"
    if os.path.exists(wsl_fallback):
        return wsl_fallback
        
    return None

def translate_to_windows_path(path):
    try:
        # Run wslpath -w to convert the path to Windows format
        res = subprocess.run(["wslpath", "-w", path], capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception:
        # Fallback if wslpath fails or is not available
        return path

def main():
    soffice_bin = get_soffice_path()
    if not soffice_bin:
        print("Error: LibreOffice 'soffice' command was not found on the system.", file=sys.stderr)
        print("Please install LibreOffice or set the SOFFICE_BIN environment variable.", file=sys.stderr)
        sys.exit(1)
        
    args = sys.argv[1:]
    is_windows_exe = soffice_bin.endswith(".exe")
    
    if not is_windows_exe:
        # Native Linux path: just execute directly
        try:
            subprocess.run([soffice_bin] + args, check=True)
        except Exception as e:
            print(f"Error running LibreOffice: {e}", file=sys.stderr)
            sys.exit(1)
        return

    # Windows executable path on WSL: use /mnt/c/temp copy-convert-move workaround
    # This avoids LibreOffice failing silently when writing to WSL UNC network paths (\\wsl.localhost\...)
    outdir = "."
    input_file = None
    
    # Parse args
    skip_next = False
    for i, arg in enumerate(args):
        if skip_next:
            skip_next = False
            continue
        if arg == "--outdir" and i + 1 < len(args):
            outdir = args[i+1]
            skip_next = True
        elif not arg.startswith("-"):
            input_file = arg
            
    if not input_file:
        print("Error: No input file specified.", file=sys.stderr)
        sys.exit(1)
        
    abs_input_file = os.path.abspath(input_file)
    abs_outdir = os.path.abspath(outdir)
    
    # Generate temp folder in C:\temp (i.e. /mnt/c/temp)
    c_temp_dir = "/mnt/c/temp"
    os.makedirs(c_temp_dir, exist_ok=True)
    
    temp_working_dir = tempfile.mkdtemp(dir=c_temp_dir, prefix="html2docx_")
    
    try:
        # Copy input file to temp dir
        temp_input_path = os.path.join(temp_working_dir, os.path.basename(abs_input_file))
        shutil.copy2(abs_input_file, temp_input_path)
        
        # Translate paths for Windows executable
        win_input_file = translate_to_windows_path(temp_input_path)
        win_temp_working_dir = translate_to_windows_path(temp_working_dir)
        
        # Build command: soffice --headless --convert-to pdf --outdir <win_temp_working_dir> <win_input_file>
        cmd = [
            soffice_bin,
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            win_temp_working_dir,
            win_input_file
        ]
        
        # Run command
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Locate the output pdf file in the temp working directory
        base_name_without_ext = os.path.splitext(os.path.basename(abs_input_file))[0]
        expected_pdf_name = base_name_without_ext + ".pdf"
        temp_pdf_path = os.path.join(temp_working_dir, expected_pdf_name)
        
        if os.path.exists(temp_pdf_path):
            os.makedirs(abs_outdir, exist_ok=True)
            dest_pdf_path = os.path.join(abs_outdir, expected_pdf_name)
            shutil.move(temp_pdf_path, dest_pdf_path)
        else:
            print(f"Error: Converted PDF file was not found in temp directory: {temp_pdf_path}", file=sys.stderr)
            sys.exit(1)
            
    finally:
        # Clean up temp working directory
        shutil.rmtree(temp_working_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
