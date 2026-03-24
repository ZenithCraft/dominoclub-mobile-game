import subprocess

print("Getting git objects...")
objects = subprocess.check_output(['git', 'rev-list', '--objects', '--all']).decode(errors='replace').splitlines()
obj_map = {line.split()[0]: ' '.join(line.split()[1:]) for line in objects if len(line.split()) > 1}

print("Checking sizes...")
p = subprocess.Popen(['git', 'cat-file', '--batch-check'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
hashes = '\n'.join(obj_map.keys()).encode()
out, _ = p.communicate(hashes)

print("Results:")
for line in out.decode(errors='replace').splitlines():
    parts = line.split()
    if len(parts) == 3 and parts[1] == 'blob':
        try:
            size = int(parts[2])
            if size > 100 * 1024 * 1024:
                print(f"LARGE BLOB: {obj_map[parts[0]]} - {size/(1024*1024):.2f} MB")
        except ValueError:
            pass
print("Done.")
