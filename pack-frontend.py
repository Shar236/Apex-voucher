import os
import zipfile

def pack_frontend():
    zip_name = "frontend-source.zip"
    web_dir = "web"
    
    print(f"Packaging {web_dir} -> {zip_name} for Hostinger...")
    
    # Exclude directories
    exclude_dirs = {
        'node_modules', '.next', '.git', 'out', '.turbo', '__pycache__'
    }
    
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(web_dir):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            rel_root = os.path.relpath(root, web_dir)
            if rel_root != '.':
                norm_root = rel_root.replace('\\', '/') + '/'
                dinfo = zipfile.ZipInfo(norm_root)
                dinfo.external_attr = (0o040755) << 16  # POSIX 0755
                z.writestr(dinfo, '')
                
            for file in files:
                if file.endswith('.tsbuildinfo') or file.endswith('.log'):
                    continue
                abs_file = os.path.join(root, file)
                rel_file = os.path.relpath(abs_file, web_dir).replace('\\', '/')
                finfo = zipfile.ZipInfo.from_file(abs_file, rel_file)
                finfo.external_attr = (0o0100644) << 16  # POSIX 0644
                with open(abs_file, 'rb') as f:
                    z.writestr(finfo, f.read())
                    
    size_mb = os.path.getsize(zip_name) / (1024 * 1024)
    print(f"SUCCESS: {zip_name} created successfully! ({size_mb:.2f} MB)")

if __name__ == "__main__":
    pack_frontend()
