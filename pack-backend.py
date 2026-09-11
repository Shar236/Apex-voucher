import os
import zipfile

def pack_backend():
    zip_name = "backend-deploy.zip"
    backend_dir = "backend"
    
    print(f"Packaging {backend_dir} -> {zip_name} for Hostinger...")
    
    # Ensure production env is copied to .env
    prod_env_path = os.path.join(backend_dir, ".env.production")
    env_path = os.path.join(backend_dir, ".env")
    if os.path.exists(prod_env_path):
        with open(prod_env_path, "r", encoding="utf-8") as f:
            content = f.read()
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(content)
            
    exclude_dirs = {
        'node_modules', '.git', 'tests', 'email-previews', '__pycache__'
    }
    
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(backend_dir):
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            
            rel_root = os.path.relpath(root, backend_dir)
            if rel_root != '.':
                norm_root = rel_root.replace('\\', '/') + '/'
                dinfo = zipfile.ZipInfo(norm_root)
                dinfo.external_attr = (0o040755) << 16  # POSIX 0755
                z.writestr(dinfo, '')
                
            for file in files:
                if file.endswith('.test.js') or file.endswith('.spec.js') or file.endswith('.log'):
                    continue
                abs_file = os.path.join(root, file)
                rel_file = os.path.relpath(abs_file, backend_dir).replace('\\', '/')
                finfo = zipfile.ZipInfo.from_file(abs_file, rel_file)
                finfo.external_attr = (0o0100644) << 16  # POSIX 0644
                with open(abs_file, 'rb') as f:
                    z.writestr(finfo, f.read())
                    
    size_mb = os.path.getsize(zip_name) / (1024 * 1024)
    print(f"SUCCESS: {zip_name} created successfully! ({size_mb:.2f} MB)")

if __name__ == "__main__":
    pack_backend()
