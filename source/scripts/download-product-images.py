"""Fetch larger public originals; preserve verified local images on any failure."""
import json, hashlib, subprocess, concurrent.futures, time, sys
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
products=json.loads((ROOT/'content/products.json').read_text())
records=products+json.loads((ROOT/'content/monthly.json').read_text())['items']
for p in (ROOT/'content/monthly-archive').glob('*.json'):
 records+=json.loads(p.read_text())['items']
for group in json.loads((ROOT/'content/product-images.json').read_text()).values():records+=group
sources={}
for p in records:
 u=p.get('imageUrl')or''
 if u.startswith('https://'):sources[u]=u
 elif u.startswith('/images/catalog/') and p.get('catalogId'):
  # Public site's observed image mapping: /big/{catalogId}.jpg.
  sources[u]='https://pxpick.com/big/'+p['catalogId']+'.jpg'
base=ROOT/'assets/product-originals';base.mkdir(exist_ok=True)
manifest_path=ROOT/'content/product-image-sources.json'
manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
extra_path=ROOT/'content/product-image-sources-extra.json'
if extra_path.exists():manifest.update(json.loads(extra_path.read_text()))
started=time.time();failed=[]
def fetch(pair):
 key,url=pair;dest=base/(hashlib.sha256(url.encode()).hexdigest()[:20]+'.img')
 if dest.exists():
  try:Image.open(dest).verify();return key,str(dest.relative_to(ROOT)),None
  except:dest.unlink()
 tmp=dest.with_suffix('.tmp')
 r=subprocess.run(['curl','-fL','-sS','--connect-timeout','10','--max-time','30','--retry','1','--retry-delay','0',url,'-o',str(tmp)],capture_output=True)
 try:
  if r.returncode:raise ValueError('download unavailable')
  im=Image.open(tmp);im.verify()
  tmp.replace(dest);return key,str(dest.relative_to(ROOT)),None
 except Exception as e:
  tmp.unlink(missing_ok=True);return key,None,str(e)
pending=[pair for pair in sources.items() if pair[0] not in manifest or not (ROOT/manifest[pair[0]]['file']).is_file()]
if len(sys.argv)>1:pending=pending[:int(sys.argv[1])]
with concurrent.futures.ThreadPoolExecutor(max_workers=32) as pool:
 for n,(key,local,error) in enumerate(pool.map(fetch,pending),1):
  if local:manifest[key]={'sourceUrl':sources[key],'file':local}
  else:failed.append(key)
  if n%100==0 or n==len(pending):
   manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
   print(f'{n}/{len(pending)} fetched; {len(failed)} unavailable; {int(time.time()-started)}s',flush=True)
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/image-download-unavailable.json').write_text(json.dumps(failed,ensure_ascii=False,indent=2))
print('Finished',len(manifest),'originals',flush=True)
