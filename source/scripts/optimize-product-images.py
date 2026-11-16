"""Build responsive WebP assets without upscaling; keep original sources out of public output."""
import json,hashlib
from pathlib import Path
from PIL import Image,ImageOps,ImageChops
ROOT=Path(__file__).resolve().parents[1]
records=json.loads((ROOT/'content/products.json').read_text())
records+=json.loads((ROOT/'content/monthly.json').read_text())['items']
for p in (ROOT/'content/monthly-archive').glob('*.json'):records+=json.loads(p.read_text())['items']
for group in json.loads((ROOT/'content/product-images.json').read_text()).values():records+=group
sources_path=ROOT/'content/product-image-sources.json'
sources=json.loads(sources_path.read_text()) if sources_path.exists() else {}
extra_path=ROOT/'content/product-image-sources-extra.json'
if extra_path.exists():sources.update(json.loads(extra_path.read_text()))
out=ROOT/'assets/products-optimized';out.mkdir(exist_ok=True)
manifest={};before=after=upgraded=0;unavailable=[];old_files=set()
def trim(im):
 if im.mode=='RGBA' and im.getextrema()[-1][0]<255:
  box=im.getchannel('A').getbbox()
 elif all(min(im.convert('RGB').getpixel(c))>=248 for c in [(0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1)]):
  diff=ImageChops.difference(im.convert('RGB'),Image.new('RGB',im.size,'white'))
  mask=diff.convert('L').point(lambda x:255 if x>15 else 0)
  box=mask.getbbox()
 else:return im
 if not box:return im
 pad=max(2,round(max(im.size)*.025));l,t,r,b=box
 return im.crop((max(0,l-pad),max(0,t-pad),min(im.width,r+pad),min(im.height,b+pad)))
for p in records:
 url=p.get('imageUrl')or'';region=p.get('imageRegion')
 key=json.dumps([url,region],ensure_ascii=False,separators=(',',':'))
 if not url or key in manifest:continue
 source=sources.get(url,{}).get('file')
 file=ROOT/source if source else ROOT/'assets'/url.removeprefix('/images/')
 if not file.is_file():unavailable.append(url);continue
 try:im=ImageOps.exif_transpose(Image.open(file));im.load()
 except:unavailable.append(url);continue
 if region:
  x,y,w,h=region;im=im.crop((x,y,x+w,y+h))
 im=trim(im);im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
 fingerprint=hashlib.sha256(im.tobytes()+str(im.size).encode()+b'webp-responsive-v1').hexdigest()[:20]
 variants=[]
 for limit,quality in [(320,84),(960,88)]:
  resized=im.copy();resized.thumbnail((limit,limit),Image.Resampling.LANCZOS)
  if variants and variants[-1]['width']==resized.width:continue
  name=f'{fingerprint}-{resized.width}.webp';dest=out/name
  if not dest.exists() or dest.stat().st_size==0:
   tmp=dest.with_suffix('.tmp')
   resized.save(tmp,'WEBP',quality=quality,method=6)
   with Image.open(tmp) as check:check.load()
   tmp.replace(dest)
  variants.append({'url':'/images/products-optimized/'+name,'width':resized.width,'height':resized.height,'bytes':dest.stat().st_size});old_files.add(name)
 thumb,detail=variants[0],variants[-1]
 manifest[key]={'imageUrl':detail['url'],'imageThumbUrl':thumb['url'],'imageSrcSet':', '.join(f"{v['url']} {v['width']}w" for v in variants) if len(variants)>1 else None,'imageWidth':detail['width'],'imageHeight':detail['height'],'imageThumbWidth':thumb['width'],'imageThumbHeight':thumb['height'],'sourceWidth':im.width,'sourceHeight':im.height,'thumbnailBytes':thumb['bytes'],'detailBytes':detail['bytes']}
 before+=file.stat().st_size;after+=thumb['bytes']
 if url.startswith('/images/catalog/') and max(im.size)>64:upgraded+=1
for file in out.iterdir():
 if file.name not in old_files:file.unlink()
(ROOT/'content/product-image-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n')
(ROOT/'work').mkdir(exist_ok=True)
(ROOT/'work/image-optimization-report.json').write_text(json.dumps({'images':len(manifest),'upgradedCatalogImages':upgraded,'originalBytes':before,'thumbnailBytes':after,'unavailable':unavailable},ensure_ascii=False,indent=2))
print(json.dumps({'images':len(manifest),'upgradedCatalogImages':upgraded,'originalBytes':before,'thumbnailBytes':after,'unavailable':len(unavailable)}))
