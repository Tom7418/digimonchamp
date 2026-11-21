"""원본 도움말의 시설별 수용수만 추출한다. 원문은 저장하지 않는다."""
from pathlib import Path
import re,json,hashlib
from extract_text import read_dat
repo=Path(__file__).resolve().parents[1];raw=repo.parent/'ui/txt/txt_list_txt.dat';texts=read_dat(raw);out={}
for no in range(1,41):
 line=texts[526+no];clean=re.sub(r'⎋.','',line)
 match=re.search(r'수용수\s*(\d+)',clean)
 if match:out[str(no)]=int(match[1])
assert out['16']==2 and out['31']==6
(repo/'src/data/cage-capacity.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
(repo/'docs/cage-capacity-audit.json').write_text(json.dumps({'source':'ui/txt/txt_list_txt.dat','sha256':hashlib.sha256(raw.read_bytes()).hexdigest(),'textIndex':'526 + facilityNo','count':len(out),'unverified':['Basic cage no0 has no corresponding source help entry; existing fallback99 is not claimed as original.']},indent=2)+'\n',encoding='utf-8')
