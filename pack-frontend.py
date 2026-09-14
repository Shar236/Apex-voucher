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
                if file.endswith('.tsbuildinfo') or file.endswith('.log') or file == '.env.local':
                    continue
                abs_file = os.path.join(root, file)
                rel_file = os.path.relpath(abs_file, web_dir).replace('\\', '/')
                finfo = zipfile.ZipInfo.from_file(abs_file, rel_file)
                finfo.external_attr = (0o0100644) << 16  # POSIX 0644
                with open(abs_file, 'rb') as f:
                    z.writestr(finfo, f.read())

        prod_env = os.path.join(web_dir, ".env.production")
        if os.path.exists(prod_env):
            with open(prod_env, 'rb') as f:
                content = f.read()
                finfo = zipfile.ZipInfo('.env')
                finfo.external_attr = (0o0100644) << 16
                z.writestr(finfo, content)
                    
    size_mb = os.path.getsize(zip_name) / (1024 * 1024)
    print(f"SUCCESS: {zip_name} created successfully! ({size_mb:.2f} MB)")

def pack_deploy():
    zip_name = "frontend-deploy.zip"
    web_dir = "web"
    standalone_dir = os.path.join(web_dir, ".next", "standalone")
    
    print(f"Packaging source + deploy build -> {zip_name} for Hostinger...")
    
    with zipfile.ZipFile(zip_name, 'w', zipfile.ZIP_DEFLATED) as z:
        added_files = set()

        def add_file(abs_path, arc_name):
            norm_name = arc_name.replace('\\', '/')
            if norm_name in added_files:
                return
            finfo = zipfile.ZipInfo.from_file(abs_path, norm_name)
            finfo.external_attr = (0o0100644) << 16
            with open(abs_path, 'rb') as f:
                z.writestr(finfo, f.read())
            added_files.add(norm_name)

        def add_dir(norm_dir):
            norm_dir = norm_dir.replace('\\', '/').rstrip('/') + '/'
            if norm_dir not in added_files and norm_dir != '/':
                dinfo = zipfile.ZipInfo(norm_dir)
                dinfo.external_attr = (0o040755) << 16
                z.writestr(dinfo, '')
                added_files.add(norm_dir)

        # 1. Add ALL source code files (app, components, lib, hooks, public, configs, package.json, etc.)
        exclude_source_dirs = {'node_modules', '.next', '.git', 'out', '.turbo', '__pycache__'}
        for root, dirs, files in os.walk(web_dir):
            dirs[:] = [d for d in dirs if d not in exclude_source_dirs]
            rel_root = os.path.relpath(root, web_dir)
            if rel_root != '.':
                add_dir(rel_root)
            for file in files:
                if file.endswith('.tsbuildinfo') or file.endswith('.log'):
                    continue
                abs_file = os.path.join(root, file)
                rel_file = os.path.relpath(abs_file, web_dir)
                add_file(abs_file, rel_file)

        # 2. Add standalone files (server.js, minimal runtime node_modules, .next/server) if available
        if os.path.exists(standalone_dir):
            for root, dirs, files in os.walk(standalone_dir):
                rel_root = os.path.relpath(root, standalone_dir)
                if rel_root != '.':
                    add_dir(rel_root)
                for file in files:
                    # Don't overwrite the main package.json with standalone's stripped package.json
                    if rel_root == '.' and file == 'package.json':
                        continue
                    abs_file = os.path.join(root, file)
                    rel_file = os.path.relpath(abs_file, standalone_dir)
                    add_file(abs_file, rel_file)

        # 3. Add static assets to .next/static
        static_dir = os.path.join(web_dir, ".next", "static")
        if os.path.exists(static_dir):
            for root, dirs, files in os.walk(static_dir):
                rel = os.path.relpath(root, static_dir)
                for file in files:
                    abs_file = os.path.join(root, file)
                    if rel == '.':
                        arcname = f".next/static/{file}"
                    else:
                        arcname = f".next/static/{rel}/{file}"
                    add_file(abs_file, arcname)

        # 4. Add/overwrite .env with production environment values
        prod_env = os.path.join(web_dir, ".env.production")
        if os.path.exists(prod_env):
            with open(prod_env, 'rb') as f:
                content = f.read()
                finfo = zipfile.ZipInfo('.env')
                finfo.external_attr = (0o0100644) << 16
                z.writestr(finfo, content)
                added_files.add('.env')

    size_mb = os.path.getsize(zip_name) / (1024 * 1024)
    print(f"SUCCESS: {zip_name} created successfully! ({size_mb:.2f} MB)")

if __name__ == "__main__":
    pack_source()
    pack_deploy()

