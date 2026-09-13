import os
import shutil
import zipfile

def pack_source():
    zip_name = "frontend-source.zip"
    web_dir = "web"
    
    print(f"Packaging {web_dir} -> {zip_name} for Hostinger (source)...")
    
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

def pack_deploy():
    zip_name = "frontend-deploy.zip"
    web_dir = "web"
    standalone_dir = os.path.join(web_dir, ".next", "standalone")
    
    if not os.path.exists(standalone_dir):
        print(f"Warning: {standalone_dir} not found. Run 'npm run build' in web/ first.")
        return
        
    print(f"Packaging standalone -> {zip_name} for Hostinger...")
    
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as z:
        # 1. Add everything from standalone
        for root, dirs, files in os.walk(standalone_dir):
            rel_root = os.path.relpath(root, standalone_dir)
            if rel_root != '.':
                norm_root = rel_root.replace('\\', '/') + '/'
                dinfo = zipfile.ZipInfo(norm_root)
                dinfo.external_attr = (0o040755) << 16
                z.writestr(dinfo, '')
            for file in files:
                abs_file = os.path.join(root, file)
                rel_file = os.path.relpath(abs_file, standalone_dir).replace('\\', '/')
                finfo = zipfile.ZipInfo.from_file(abs_file, rel_file)
                finfo.external_attr = (0o0100644) << 16
                with open(abs_file, 'rb') as f:
                    z.writestr(finfo, f.read())
                    
        # 2. Add static assets to .next/static
        static_dir = os.path.join(web_dir, ".next", "static")
        if os.path.exists(static_dir):
            for root, dirs, files in os.walk(static_dir):
                rel = os.path.relpath(root, static_dir)
                for file in files:
                    abs_file = os.path.join(root, file)
                    if rel == '.':
                        arcname = f".next/static/{file}"
                    else:
                        arcname = f".next/static/{rel.replace(chr(92), '/')}/{file}"
                    finfo = zipfile.ZipInfo.from_file(abs_file, arcname)
                    finfo.external_attr = (0o0100644) << 16
                    with open(abs_file, 'rb') as f:
                        z.writestr(finfo, f.read())
                        
        # 3. Add public directory
        public_dir = os.path.join(web_dir, "public")
        if os.path.exists(public_dir):
            for root, dirs, files in os.walk(public_dir):
                rel = os.path.relpath(root, public_dir)
                for file in files:
                    abs_file = os.path.join(root, file)
                    if rel == '.':
                        arcname = f"public/{file}"
                    else:
                        arcname = f"public/{rel.replace(chr(92), '/')}/{file}"
                    finfo = zipfile.ZipInfo.from_file(abs_file, arcname)
                    finfo.external_attr = (0o0100644) << 16
                    with open(abs_file, 'rb') as f:
                        z.writestr(finfo, f.read())
                        
        # 4. Ensure .env has production values
        prod_env = os.path.join(web_dir, ".env.production")
        if os.path.exists(prod_env):
            with open(prod_env, 'rb') as f:
                content = f.read()
                finfo = zipfile.ZipInfo('.env')
                finfo.external_attr = (0o0100644) << 16
                z.writestr(finfo, content)
                
    size_mb = os.path.getsize(zip_name) / (1024 * 1024)
    print(f"SUCCESS: {zip_name} created successfully! ({size_mb:.2f} MB)")

if __name__ == "__main__":
    pack_source()
    pack_deploy()

