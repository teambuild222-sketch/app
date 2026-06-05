import os

keywords = ['iphone', 'device', 'frame', 'dynamic', 'island', '9:41', 'battery', 'signal', 'wifi', 'status-bar', 'statusbar', 'mockup']
for root, dirs, files in os.walk('.'):
    if 'node_modules' in dirs:
        dirs.remove('node_modules')
    if '.git' in dirs:
        dirs.remove('.git')
    for file in files:
        path = os.path.join(root, file)
        try:
            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                found = [kw for kw in keywords if kw in content.lower()]
                if found:
                    print(f"{path}: {found}")
        except Exception as e:
            pass
