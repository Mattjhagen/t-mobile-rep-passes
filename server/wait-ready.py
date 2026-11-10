import json,sys,time,urllib.request
url=sys.argv[1]
for attempt in range(100):
    try:
        with urllib.request.urlopen(url,timeout=1) as response:
            data=json.load(response)
        if data.get('configured') is True and ('user' not in data or data['user'] is None):
            print('Rep account endpoint healthy:',url)
            sys.exit(0)
    except (OSError,ValueError):
        pass
    time.sleep(0.2)
print('Rep account endpoint did not become ready:',url,file=sys.stderr)
sys.exit(1)
