
/**
 * Utility to extract audio from a video file on the client side.
 * This significantly reduces the payload size sent to the server.
 */

export async function extractAudioFromVideo(videoFile: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const originalBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Downsample to 16kHz Mono for faster processing and smaller payload
        const targetSampleRate = 16000;
        const offlineCtx = new OfflineAudioContext(
          1, // mono
          Math.floor(originalBuffer.duration * targetSampleRate),
          targetSampleRate
        );
        
        const source = offlineCtx.createBufferSource();
        source.buffer = originalBuffer;
        source.connect(offlineCtx.destination);
        source.start();
        
        const renderedBuffer = await offlineCtx.startRendering();
        const wavBlob = audioBufferToWav(renderedBuffer);
        resolve(wavBlob);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error("Failed to read video file"));
    reader.readAsArrayBuffer(videoFile);
  });
}

/**
 * Encodes AudioBuffer to WAV format
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArray = new ArrayBuffer(length);
  const view = new DataView(bufferArray);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // clamp
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true); // write 16-bit sample
      pos += 2;
    }
    offset++; // next source sample
  }

  return new Blob([bufferArray], { type: "audio/wav" });
}

/**
 * Extracts a frame from the video at a specific time (default 1s)
 * Optimized to 720p max for visual context without heavy payload
 */
export async function extractVideoFrame(videoFile: File, timeInSeconds: number = 1): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(videoFile);
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(timeInSeconds, video.duration);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      
      // Scale down if too large (max 1280px width)
      const MAX_WIDTH = 1280;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width > MAX_WIDTH) {
        height = (MAX_WIDTH / width) * height;
        width = MAX_WIDTH;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6); // Lower quality for context
        URL.revokeObjectURL(video.src);
        resolve(dataUrl.split(',')[1]);
      } else {
        reject(new Error("Failed to get canvas context"));
      }
    };

    video.onerror = () => reject(new Error("Failed to load video for frame extraction"));
  });
}
