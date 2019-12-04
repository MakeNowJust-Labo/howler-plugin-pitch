// 参考: https://github.com/urtzurd/html-audio/blob/e1f733a4845eb330e7c81166debb18aa5be49f68/static/js/pitch-shifter.js

import { Howl, Howler } from 'howler';

import audioURL from './assets/audio.mp3';

interface HowlSound {
  _node: GainNode & { bufferSource: AudioBufferSourceNode };
  _panner: PannerNode | StereoPannerNode;
  _paused: boolean;
  _id: number;
}

const grainSize = 2**12;
let pitchRatio = 1.0;
let overlapRatio = 0;

const main = async () => {
  const howl = new Howl({src: audioURL}) as any;

  // _refreshBufferにパッチを当てて強引にWebAudioのノード接続を変更する。
  const oldRefreshBuffer: (this: Howl, sound: HowlSound) => Howl = howl._refreshBuffer;
  howl._refreshBuffer = function(this: Howl, sound: HowlSound): Howl {
    oldRefreshBuffer.call(this, sound);

    const pitchShifter = Howler.ctx.createScriptProcessor(grainSize, 1, 1);

    const buffer = new Float32Array(grainSize * 2);
    const grainData = new Float32Array(grainSize * 2);

    // 窓関数:
    // ブラックマン窓などにすると区切りでのぶつぶつ音は減るけれど区切りで音量が小さくなってしまい、
    // 全体的にもわもわした感じになる。
    // 対処するにはoverlapRatioの大きさによって窓関数のパラメータを切り替えたり、波形の局所的な周期を探索するとよさそうだけど、
    // 上手く実装できるかは不明。
    const grainWindow = new Float32Array(grainSize);
    for (let i = 0; i < grainSize; i++) {
      // 矩形窓
      grainWindow[i] = 1.0;
      // ブラックマン窓
      // grainWindow[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (grainSize - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (grainSize - 1));
    }

    pitchShifter.onaudioprocess = function(event) {
      const inputData = event.inputBuffer.getChannelData(0);
      const outputData = event.outputBuffer.getChannelData(0);

      // bufferの後半のデータを前に移して、後半のデータを0にする。
      for (let i = 0; i < grainSize; i++) {
        buffer[i] = buffer[i + grainSize];
        buffer[i + grainSize] = 0;
      }

      // pitchRatio毎にinputDataからgrainDataにサンプリングする。
      for (let i = 0, j = 0; i < grainSize; i++, j += pitchRatio) {
        const a = inputData[Math.floor(j) % grainSize];
        const b = inputData[Math.floor(j + pitchRatio) % grainSize];
        grainData[i] = (a + (b - a) * (j % 1.0)) * grainWindow[i];
      }

      // overlapRatio分重なるようにbufferに代入。
      for (let i = 0; i < grainSize; i += Math.round(grainSize * (1 - overlapRatio))) {
        for (let j = 0; j < grainSize; j++) {
          buffer[i + j] += grainData[j];
        }
      }

      // outputDataにbufferを移す。
      for (let i = 0; i < grainSize; i++) {
        outputData[i] = buffer[i];
      }
    };

    const bufferSource = sound._node.bufferSource;
    bufferSource.disconnect(0);
    const destination: AudioNode = sound._panner || sound._node;

    bufferSource.connect(pitchShifter).connect(destination);

    return this;
  };

  let id: number = 0;

  document.querySelector('#play')!.addEventListener('click', () => {
    clearInterval(id);
    howl.stop();
    pitchRatio = 1.0;

    let diff = 0;
    setInterval(() => {
      if (pitchRatio >= 5.0) {
        clearInterval(id);
        return;
      }
      const y = 0.01 - diff;
      const t = pitchRatio + y;
      diff = (t - pitchRatio) - y;
      pitchRatio = t;
      document.querySelector('#pitchRatio')!.textContent = `pitchRatio = ${pitchRatio}`;
    }, 100);

    howl.play();
  });
  document.querySelector('#stop')!.addEventListener('click', () => {
    clearInterval(id);
    howl.stop();
    pitchRatio = 1.0;
  });
};

main().catch(err => console.error(err));
