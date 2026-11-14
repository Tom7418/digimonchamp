"""로컬 원본 코드의 애니메이션 선택 근거를 검사해 숫자 대응만 기록한다. 바이너리·디스어셈블은 내보내지 않는다."""
import argparse,hashlib,json,struct
from pathlib import Path
from extract_animations import decode
PROJECT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',type=Path,default=PROJECT.parent);args=p.parse_args()
 root=args.source_root;arm=(root/'ftc/arm9.bin').read_bytes()
 files={str(i):(root/f'ftc/overlay9_{i}').read_bytes() for i in [0,18,19]}
 base=struct.unpack_from('<I',(root/'ftc/y9.bin').read_bytes(),18*32+4)[0]
 def word(overlay,address):return struct.unpack_from('<I',files[str(overlay)],address-base)[0]
 def branch(overlay,address):
  w=word(overlay,address);i=w&0xffffff
  if i&0x800000:i-=0x1000000
  return address+8+i*4
 assert word(18,0x211bb7c)==0xe3a0100e
 assert branch(18,0x211bb80)==0x21159c4
 assert branch(18,0x211bc24)==0x210f220
 assert word(18,0x2118e00)==0xe3a0101d
 assert word(19,0x21168f0)==0x03a01005 and word(19,0x21168f4)==0x13a01006
 assert branch(19,0x21168fc)==0x2117ad8
 assert word(19,0x2116558)==0xe3a0100f
 assert word(0,0x2121c68)==0xe3a01013 and word(0,0x2121c74)==0xe3a01003
 command_sequences={0:8,1:3,2:33,3:0,4:29,6:0,7:35,8:31,9:30,10:1,11:1,12:13,13:1,16:4,17:4,18:1,19:4,20:6,21:14,22:31,25:32,27:28,28:14,29:31,30:34}
 facilities=[]
 for i in range(37):
  row=struct.unpack_from('<10I',arm,0xc81e0+i*40);off=row[0]-0x2000000
  name=arm[off:off+32].split(b'\0')[0].decode('ascii')
  facilities.append({'resource':name,'commands':list(row[1:4]),'primarySequence':command_sequences.get(row[2]),'secondarySequence':command_sequences.get(row[3])})
 report={'method':'static ARM code paths and NANR; no emulator trace','hashes':{'arm9':hashlib.sha256(arm).hexdigest(),**{f'overlay{k}':hashlib.sha256(v).hexdigest() for k,v in files.items()}},
 'eat':{'sequence':14,'select':'overlay18 0x0211bb7c/0x0211bb80','consume':'0x0211bc24 -> 0x0210f220; subtracts target data+0x10 and updates depleted object','agumonFrames':[24,25],'toyagumonFrames':[24,25]},
 'hurt':{'sequences':[5,6],'select':'overlay19 0x021168ec..0x021168fc','ordinaryReaction':'0x021189c8..0x021189f4 chooses reaction1/2; 0x02118a88 sets action15; dispatcher0x02116890','exceptions':'status and attack-specific reactions use other sequences; not all special branches implemented'},
 'ko':{'sequence':37,'source':'user-provided GIF classification: Knocked Out','correction':'previous sequence15 code branch is Sleep2 pose, not the general visual knockout mapping'},
 'rope':{'userVerifiedAgumonCells':[27,43],'sequenceRange':[16,25],'codeCorroboration':'overlay0 0x02121c58..0x02121c78 selects sequence19 instead of3 with bound flag+0x118'},
 'sleep':{'sequence':13,'entry':'overlay18 0x0211b888/0x0211b894','status':'rest-state path, not knockout'},
 'training':{'table':'ARM9 0x020c81e0; 37 records of40 bytes','dispatch':'overlay18 0x021191d4..0x02119300 -> 0x02118cfc -> 0x02118a10 -> 0x0211ceb0','facilities':facilities},
 'correction':'Previous eat=29 and hurt=4 were visual guesses and wrong for these code paths. Previous eat=30 candidate withdrawn: common effect actor+0x1d8 was not proof of a food object.',
 'limitations':['training table includes alternative and multi-stage actions; web currently uses first mapped action only','special hit reactions remain partially decoded','60Hz playback remains previous interpretation']}
 out=PROJECT/'docs/animation-code-audit.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('Verified eat14 / normal hit5,6 / GIF KO37; facility table37; rope code branch19 vs3')
if __name__=='__main__':main()
