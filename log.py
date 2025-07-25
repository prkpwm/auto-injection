import os
import fnmatch

# Configuration
directory = '.'  # Target directory
log_file = 'log.md'  # Output log file
exclude = ['*.md', '*.css', '*.png', '.git','*.py']  # Patterns to exclude

# Helper to check if a file or dir should be excluded
def is_excluded(path):
    return any(fnmatch.fnmatch(os.path.basename(path), pattern) for pattern in exclude)

# Read and log content
with open(log_file, 'w', encoding='utf-8') as log:
    for root, dirs, files in os.walk(directory):
        # Filter excluded directories
        dirs[:] = [d for d in dirs if not is_excluded(d)]
        for file in files:
            if is_excluded(file):
                continue  # Skip excluded files
            full_path = os.path.join(root, file)
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                log.write(f'File: {os.path.relpath(full_path)}\n')
                log.write(f'Content:\n{content}\n')
                log.write('-' * 60 + '\n')
            except Exception as e:
                log.write(f'Failed to read {file}: {e}\n')
