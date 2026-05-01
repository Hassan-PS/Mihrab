with open('/Users/hassan/git/fdroiddata/metadata/com.prayer_times.yml', 'r') as f:
    content = f.read()

old_block = """  - versionName: 1.5.36
    versionCode: 59
    commit: v1.5.36"""

new_block = """  - versionName: 1.5.37
    versionCode: 60
    commit: v1.5.37"""

content = content.replace(old_block, new_block)

content = content.replace('CurrentVersion: 1.5.36', 'CurrentVersion: 1.5.37')
content = content.replace('CurrentVersionCode: 59', 'CurrentVersionCode: 60')

with open('/Users/hassan/git/fdroiddata/metadata/com.prayer_times.yml', 'w') as f:
    f.write(content)
