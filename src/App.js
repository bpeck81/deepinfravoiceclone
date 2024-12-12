// Front-end React app with React Query for API calls and improved UI
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from 'react-query';
import './App.css'; // Add CSS for better styling
import { FiRefreshCw } from 'react-icons/fi';


const queryClient = new QueryClient();

const App = () => {
  const [newVoice, setNewVoice] = useState({ name: '', description: '', audio: null });
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [inputText, setInputText] = useState('The ghost lets out a hearty laugh, and the chandelier above us sways hesitantly. "Haven\'t heard that one before. But I do like a good prankster! ');
  const [speed, setSpeed] = useState(1.2);
  const [pitch, setPitch] = useState(1.05);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [userApiKey, setUserApiKey] = useState(getCookie('apiKey') || '');
  const [errorMessage, setErrorMessage] = useState('');

  // New states for clipping
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipDuration, setClipDuration] = useState(10);

  const apiUrl = "https://api.deepinfra.com/v1";

  // Fetch voices
  const { data: voices = [], isLoading, error, refetch } = useQuery(
    ['voices', userApiKey],
    async () => {
      const response = await axios.get(`${apiUrl}/voices`, {
        headers: { Authorization: `Bearer ${userApiKey}` },
      });
      return response.data.voices?.sort((a, b) => {
        if (a.user_id === 'preset') return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      }) || [];
    },
    {
      enabled: !!userApiKey, // Only fetch if API key is present
    }
  );

  // Add voice mutation
  const addVoiceMutation = useMutation(
    async (formData) => {
      const response = await axios.post(`${apiUrl}/voices/add`, formData, {
        headers: {
          Authorization: `Bearer ${userApiKey}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('voices');
        refetch()
        setErrorMessage(''); // Clear any existing error messages
      },
      onError: (error) => {
        setErrorMessage(error.response?.data?.message || 'An error occurred while adding the voice.');
        console.error("Error adding voice:", error);
      },
    }
  );

  // Delete voice mutation
  const deleteVoiceMutation = useMutation(
    async (id) => {
      await axios.delete(`${apiUrl}/voices/${id}`, {
        headers: { Authorization: `Bearer ${userApiKey}` },
      });
    },
    {
      onSuccess: () => {
        refetch()
        queryClient.invalidateQueries('voices');
      },
      onError: (error) => {
        setErrorMessage(error.response?.data?.message || 'An error occurred while deleting the voice.');
        refetch()
      },
    },
  );

  const handleAddVoice = async () => {
    setIsAdding(true);

    if (!newVoice.audio) {
      setErrorMessage('Please select an audio file.');
      setIsAdding(false);
      return;
    }

    try {
      const audioContext = new AudioContext();
      const audioData = await newVoice.audio.arrayBuffer();
      const originalBuffer = await audioContext.decodeAudioData(audioData);

      let clippedBuffer = originalBuffer;

      if (clipEnabled) {
        const desiredDuration = parseFloat(clipDuration);
        const duration = Math.min(originalBuffer.duration, desiredDuration);

        // Create a new clipped buffer
        const numFrames = Math.floor(duration * originalBuffer.sampleRate);
        clippedBuffer = audioContext.createBuffer(
          originalBuffer.numberOfChannels,
          numFrames,
          originalBuffer.sampleRate
        );

        // Copy channel data up to numFrames
        for (let ch = 0; ch < originalBuffer.numberOfChannels; ch++) {
          const channelData = originalBuffer.getChannelData(ch);
          clippedBuffer.getChannelData(ch).set(channelData.subarray(0, numFrames));
        }
      }

      // Convert clippedBuffer (or entire buffer if not clipped) to WAV
      const wavData = encodeWAV(clippedBuffer);
      const clippedBlob = new Blob([wavData], { type: 'audio/wav' });

      const formData = new FormData();
      formData.append('files', clippedBlob, 'clipped_audio.wav');
      formData.append('name', newVoice.name || "Default Name");
      formData.append('description', newVoice.description || "Default Description");

      addVoiceMutation.mutate(formData, {
        onSettled: () => setIsAdding(false),
      });

      setNewVoice({ name: '', description: '', audio: null });
    } catch (error) {
      setErrorMessage('An error occurred while processing the audio file.');
      console.error("Error clipping audio:", error);
      setIsAdding(false);
    }
  };

  const encodeWAV = (audioBuffer) => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write sample data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = audioBuffer.getChannelData(channel)[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setInt16(offset, clamped * 0x7fff, true);
        offset += bytesPerSample;
      }
    }

    return buffer;
  };

  const handleDeleteVoice = (id) => {
    if (!id) console.error('No voice id provided');
    deleteVoiceMutation.mutate(id);
    if (selectedVoice && selectedVoice.voice_id === id) {
      setSelectedVoice(null);
    }
  };

  const playVoice = async () => {
    if (!selectedVoice) return;
    setIsPlaying(true);
    try {
      const processedText = inputText
        .replace(/\n/g, '')
        .replace(/"/g, '')
        .replace(/-/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\.+/g, '.')
        .replace(/[“”‘’]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const response = await axios.post(`${apiUrl}/inference/deepinfra/tts`, {
        text: processedText,
        voice_id: ['luna', 'aura', 'quartz'].includes(selectedVoice.voice_id) ? undefined : selectedVoice.voice_id,
        preset_voice: ['luna', 'aura', 'quartz'].includes(selectedVoice.voice_id) ? selectedVoice.voice_id : undefined,
        language_code: "en",
        speed: parseFloat(speed),
      }, {
        headers: { Authorization: `Bearer ${userApiKey}`, 'Content-Type': 'application/json' },
      });

      const base64Audio = response.data.audio.replace(/^data:audio\/\w+;base64,/, '');
      const audioBlob = new Blob([Uint8Array.from(atob(base64Audio), (c) => c.charCodeAt(0))], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;

      source.playbackRate.value = parseFloat(pitch);
      source.connect(audioContext.destination);
      source.start();
    } catch (error) {
      setErrorMessage('An error occurred while playing the voice.');
      console.error("Error playing voice:", error);
    } finally {
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    document.title = "Voice Clone Studio";
  }, []);


  useEffect(() => {
    const timer = setTimeout(() => {
      setErrorMessage('');
    }, 5000);

    return () => clearTimeout(timer);
  }, [errorMessage]);

  useEffect(() => {
    if (userApiKey) {
      refetch();
    }
  }, [userApiKey, refetch]);

  return (
    <div className="app-container">
      <h1 className="app-header">Voice Clone Studio</h1>
      <h2 className='app-subheader'>Text to speech voice cloning</h2>
      <a href='https://github.com/bpeck81/deepinfravoiceclone' style={{ textAlign: 'center', display: 'block' }}>source code</a>
      <div className="error-banner" style={{ backgroundColor: 'salmon', opacity: errorMessage === '' ? 0 : 1, color: 'white', height: 20, padding: '10px', marginBottom: '20px' }}>{errorMessage}</div>
      <div className="app-content">
        <div>
          <div className="api-key-section">
            <h2>1. API Key</h2>
            <label htmlFor="api-key">Enter Your API Key </label>
            <input
              id="api-key"
              type="text"
              placeholder="API Key"
              value={userApiKey}
              onChange={(e) => {
                setCookie('apiKey', e.target.value, 30);
                setUserApiKey(e.target.value);
              }}
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
            />
            <br />
            <br />
            <a href='https://deepinfra.com/dash/api_keys' style={{ color: 'black' }}>Get API Key Here</a>
            <br />
            <br />
            <text style={{ fontSize: 14 }}>You need an API key to use the app.</text>
          </div>

          <div className="add-voice-section">

            <h2>2. Add Voice</h2>
            <div>
              <input
                id="voice-audio"
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const fileName = e.target.files[0]?.name.split('.')?.[0];
                  setNewVoice({ ...newVoice, audio: e.target.files[0], name: fileName, description: fileName });
                }}
                style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
              />
              <label htmlFor="voice-name">Name</label>
              <input
                id="voice-name"
                type="text"
                placeholder="Name"
                value={newVoice.name}
                onChange={(e) => setNewVoice({ ...newVoice, name: e.target.value })}
                style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
              />
              <label htmlFor="voice-description">Description</label>
              <input
                id="voice-description"
                type="text"
                placeholder="Description"
                value={newVoice.description}
                onChange={(e) => setNewVoice({ ...newVoice, description: e.target.value })}
                style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
              />

              {/* New clipping controls */}
              <div style={{ marginTop: '10px' }}>
                <div style={{ flexDirection: 'row', display:'flex', alignItems: 'flex-start' }}>
                  <label htmlFor="clip-enabled" style={{ marginLeft: '5px' }}>Clip Audio?</label>
                  <input
                    type="checkbox"
                    id="clip-enabled"
                    checked={clipEnabled}
                    onChange={(e) => setClipEnabled(e.target.checked)}
                  />
                </div>
                {clipEnabled && (
                  <>
                    <br />
                    <label htmlFor="clip-duration">Clip Duration (seconds): </label>
                    <input
                      id="clip-duration"
                      type="number"
                      min="1"
                      step="1"
                      value={clipDuration}
                      onChange={(e) => setClipDuration(e.target.value)}
                      style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
                    />
                  </>
                )}
              </div>

              {userApiKey && (
                <button onClick={handleAddVoice} disabled={isAdding} style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px', marginTop: '10px' }}>
                  {isAdding ? 'Adding...' : 'Add Voice'}
                </button>
              )}
              <div style={{ paddingTop: 10 }}>
                <text style={{ color: 'black', fontSize: 14 }}>{'Supports .m4a, .mp3 (not .wav but you can try...)'}</text>
                <br />
                <text style={{ color: 'black', fontSize: 14 }}>{'Seems to perform better with short clips, around 10 seconds.'}</text>
              </div>
            </div>
          </div>
        </div>

        <div className="voice-management-section">
          <div className="voice-list-section">
            <h2>3. Voices</h2>
            <p>Total Voices: {voices.length}</p>
            <div className="voice-list">
              {voices.map((voice) => (
                <div
                  key={voice.voice_id}
                  className={`voice-item ${selectedVoice?.voice_id === voice.voice_id ? 'selected' : ''}`}
                  onClick={() => setSelectedVoice(voice)}
                  style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
                >
                  <h3>{voice.name}</h3>
                  <p>ID: {voice.voice_id}</p>
                  <p>{voice.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginLeft: '195px' }}>
          <div className="voice-action-section">
            <h2>4. Selected Voice: {selectedVoice?.name}</h2>
            <label htmlFor="play-text">Text to Play</label>
            <textarea
              style={{ height: '100px', width: '100%', fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
              id="play-text"
              type="text"
              placeholder="Enter text to play"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <label htmlFor="play-speed">Speed</label>
            <input
              id="play-speed"
              type="number"
              placeholder="Speed (e.g., 1.0)"
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(e.target.value)}
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
            />
            <label htmlFor="play-pitch">Pitch</label>
            <input
              id="play-pitch"
              type="number"
              step={0.01}
              placeholder="Pitch (e.g., 1.0)"
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}
            />
            {selectedVoice && (
              <>
                <button onClick={playVoice} disabled={isPlaying} style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}>
                  {isPlaying ? 'Playing...' : 'Play Voice'}
                </button>
                <button style={{ backgroundColor: 'lightpink', fontFamily: 'Arial, sans-serif', fontSize: '16px' }} onClick={() => handleDeleteVoice(selectedVoice?.voice_id)}>Delete Voice</button>
              </>
            )}
          </div>
          <div className="api-call-section">
            <h2>5. API Call</h2>
            <pre style={{ fontFamily: 'Courier New, monospace', fontSize: '14px' }}>
              {
                `
const processedText = ${inputText}
.replace(/\n/g, '')
.replace(/"/g, '')
.replace(/-/g, '')
.replace(/[^a-zA-Z0-9\\s]/g, '')
.replace(/\\.+/g, '.')
.replace(/[“”‘’]/g, '')
.replace(/\\s+/g, ' ')
.trim();
fetch('${apiUrl}/inference/deepinfra/tts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${userApiKey}',
  },
  body: JSON.stringify({
    text: processedText,
    voice_id: ['luna', 'aura', 'quartz'].includes(${selectedVoice?.voice_id}) ? undefined : ${selectedVoice?.voice_id},
    preset_voice: ['luna', 'aura', 'quartz'].includes(${selectedVoice?.voice_id}) ? ${selectedVoice?.voice_id} : undefined,
    language_code: "en",
    speed: ${speed},
  })
})
  .then(response => response.json())
  .then(data => {
    console.log(data);
  })
  .catch(error => console.error(error));
  //handle output format
  const base64Audio = response.data.audio.replace(/^data:audio\\/\\w+;base64,/, ''); 
  const audioBlob = new Blob([Uint8Array.from(atob(base64Audio), (c) => c.charCodeAt(0))], { type: 'audio/wav' });
  const audioUrl = URL.createObjectURL(audioBlob);

  //control pitch
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(await audioBlob.arrayBuffer());

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;

  source.playbackRate.value = parseFloat(${pitch});
  source.connect(audioContext.destination);
  source.start();
`
              }
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};

const RootApp = () => (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

export default RootApp;

const setCookie = (name, value, days) => {
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

const getCookie = (name) => {
  const matches = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return matches ? decodeURIComponent(matches[1]) : '';
};
