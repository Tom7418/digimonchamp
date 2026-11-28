"""원작 사운드 WAV 묶음(sound_data_WAV.zip) → 웹판 MP3 + web/assets/audio/manifest.js

입력 ZIP은 PC에서 sound_data.sdat를 변환한 것이다(Music/, Streams/, Sound effects/<SEQARC>/, 폴더마다 manifest.csv).
반복 곡은 WAV 'smpl' 청크의 반복 지점(샘플 단위)을 그대로 manifest.js에 초로 적는다.

- MP3는 32 kHz(원본 32768 Hz는 MP3 표본율이 아니라 가장 가까운 32000으로 바꾼다. 음높이는 그대로).
- 길이 0인 더미(SEQ_DUMMY·CMN_DUMMY·STRM_CMN_DUMMY)는 넣지 않는다.
- manifest 항목: { src, dur, loop?: [시작초, 끝초] }. dur는 원본 길이로, 디코더가 MP3 앞 공백을
  남겼는지 판단할 때 쓴다(web/game-audio.js).

사용: python tools/convert_sound_wav.py <sound_data_WAV.zip> [web/assets/audio]
필요: ffmpeg (libmp3lame)
"""
import csv, io, json, os, struct, subprocess, sys, tempfile, zipfile

SKIP = {'SEQ_DUMMY', 'CMN_DUMMY', 'STRM_CMN_DUMMY'}
QUALITY = {'Music': '5', 'Streams': '4', 'Sound effects': '4'}  # LAME VBR 품질(작을수록 좋음)


def wav_info(data):
    """(표본율, 프레임 수, 반복 [시작, 끝] 프레임 또는 None)"""
    assert data[:4] == b'RIFF' and data[8:12] == b'WAVE'
    i, rate, frames, block, loop = 12, None, 0, 1, None
    while i + 8 <= len(data):
        cid, n = data[i:i + 4], struct.unpack('<I', data[i + 4:i + 8])[0]
        body = data[i + 8:i + 8 + n]
        if cid == b'fmt ':
            _, ch, rate, _, block, _ = struct.unpack('<HHIIHH', body[:16])
        elif cid == b'data':
            frames = n // block
        elif cid == b'smpl' and struct.unpack('<I', body[28:32])[0] > 0:
            _, _, start, end = struct.unpack('<IIII', body[36:52])
            loop = [start, end]
        i += 8 + n + (n & 1)
    return rate, frames, loop


def main(zip_path, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    z = zipfile.ZipFile(zip_path)
    entries = {}
    for name in sorted(z.namelist()):
        if not name.endswith('manifest.csv'):
            continue
        folder = name.rsplit('/', 1)[0]
        group = folder.split('/')[0]
        for row in csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig')):
            sound = row['name']
            if sound in SKIP or row['status'] == 'empty':
                continue
            wav = f"{folder}/{int(row['index']):03d}_{sound}.wav"
            data = z.read(wav)
            rate, frames, loop = wav_info(data)
            assert sound not in entries, sound
            out = os.path.join(out_dir, sound + '.mp3')
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
                t.write(data)
            try:
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', t.name, '-ar', '32000', '-c:a', 'libmp3lame',
                                '-q:a', QUALITY[group], '-map_metadata', '-1', out], check=True)
            finally:
                os.unlink(t.name)
            entry = {'src': 'assets/audio/' + sound + '.mp3', 'dur': round(frames / rate, 4)}
            if loop:
                entry['loop'] = [round(loop[0] / rate, 4), round(loop[1] / rate, 4)]
            entries[sound] = entry
    lines = ["'use strict';",
             '// 원작 사운드 이름(web/sound-cues.js) → 이 폴더의 음원. tools/convert_sound_wav.py가 만든다(직접 고치지 말 것).',
             '// src 파일, dur 원본 길이(초), loop 반복 구간 [시작, 끝](초, 원본 WAV smpl 청크). 없는 이름은 웹판 합성음을 쓴다.',
             'window.ORIGINAL_SOUND_FILES = {']
    for sound, e in entries.items():
        lines.append(f'  {sound}: {json.dumps(e, separators=(",", ":"))},')
    lines.append('};')
    with open(os.path.join(out_dir, 'manifest.js'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')
    size = sum(os.path.getsize(os.path.join(out_dir, s + '.mp3')) for s in entries)
    print(f'{len(entries)}개, {size / 1e6:.1f} MB, 반복 {sum("loop" in e for e in entries.values())}개')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'web/assets/audio')
