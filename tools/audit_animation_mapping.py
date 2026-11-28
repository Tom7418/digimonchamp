"""로컬 원본 코드의 애니메이션 선택 근거를 검사해 숫자 대응만 기록한다. 바이너리·디스어셈블은 내보내지 않는다."""
import argparse,hashlib,json,struct
from pathlib import Path
from extract_animations import facility_training, TRAINING_ALIASES, TRAINING_COMMANDS
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
 assert word(18,0x2118db4)==0xe3a010b4 and word(18,0x211b6ac)==0xe3a01003  # 달리기 180프레임·시퀀스3
 assert word(18,0x211ec84)==0xe3a01000 and branch(18,0x211ec98)==0x2046e38  # 고산은 시퀀스0
 assert word(18,0x21190c8)==0xe3a01020 and word(18,0x21190d4)==0xe3a0000f and word(18,0x21190e4)==0xe3a0001e
 assert word(18,0x2119164)==0xe3a0101f and word(18,0x2119174)==0xe3a0c032
 assert word(18,0x2119184)==0xe3a01000 and word(18,0x2119188)==0xe3a0303c
 assert branch(18,0x211cd84)==0x2046e18 and branch(18,0x211ce00)==0x2046e18  # 다음 자세 적용
 facilities=[]
 for name, commands in facility_training(arm):
  _, primary, alternative = commands
  action = TRAINING_COMMANDS.get(primary)
  variant = TRAINING_COMMANDS.get(alternative)
  facilities.append({'resource':name,'commands':list(commands),'primarySequence':action[0][0] if action else None,
                     'secondarySequence':variant[0][0] if variant else None,'primaryPhases':action})
 report={'method':'static ARM code paths and NANR; no emulator trace','hashes':{'arm9':hashlib.sha256(arm).hexdigest(),**{f'overlay{k}':hashlib.sha256(v).hexdigest() for k,v in files.items()}},
 'eat':{'sequence':14,'select':'overlay18 0x0211bb7c/0x0211bb80','consume':'0x0211bc24 -> 0x0210f220; subtracts target data+0x10 and updates depleted object','agumonFrames':[24,25],'toyagumonFrames':[24,25]},
 'hurt':{'sequences':[5,6],'select':'overlay19 0x021168ec..0x021168fc','ordinaryReaction':'0x021189c8..0x021189f4 chooses reaction1/2; 0x02118a88 sets action15; dispatcher0x02116890','exceptions':'status and attack-specific reactions use other sequences; not all special branches implemented'},
 'ko':{'sequence':37,'source':'user-provided GIF classification: Knocked Out','correction':'previous sequence15 code branch is Sleep2 pose, not the general visual knockout mapping'},
 'rope':{'userVerifiedAgumonCells':[27,43],'sequenceRange':[16,25],'codeCorroboration':'overlay0 0x02121c58..0x02121c78 selects sequence19 instead of3 with bound flag+0x118'},
 'sleep':{'sequence':13,'entry':'overlay18 0x0211b888/0x0211b894','status':'rest-state path, not knockout'},
 'training':{'table':'ARM9 0x020c81e0; 37 records of40 bytes','dispatch':'overlay18 0x021191d4..0x02119300 -> 0x02118cfc -> 0x02118a10 -> 0x0211ceb0','facilities':facilities,
             'phaseFormat':'[NANR sequence, optional original hold in frames]',
             'webAliases':TRAINING_ALIASES},
 'correction':'Previous eat=29 and hurt=4 were visual guesses and wrong for these code paths. Previous eat=30 candidate withdrawn: common effect actor+0x1d8 was not proof of a food object.',
 'limitations':['web training repeats the primary action; secondarySequence is an independent AI choice, not the next phase','special hit reactions remain partially decoded','60Hz playback remains previous interpretation']}
 out=PROJECT/'docs/animation-code-audit.json';out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('Verified eat14 / normal hit5,6 / GIF KO37; facility table37; rope code branch19 vs3')
if __name__=='__main__':main()
