// Front-end React app with React Query for API calls and improved UI
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from 'react-query';
import './App.css'; // Add CSS for better styling

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
        queryClient.invalidateQueries('voices');
      },
      onError: (error) => {
        setErrorMessage(error.response?.data?.message || 'An error occurred while deleting the voice.');
      },
    }
  );

  const handleAddVoice = () => {
    setIsAdding(true);

    if (!newVoice.audio) {
      setErrorMessage('Please select an audio file.');
      setIsAdding(false);
      return;
    }

    const formData = new FormData();
    // formData.append('audio', newVoice.audio); // Attach the audio file directly
    console.log('adding', newVoice);
    formData.append('files', newVoice.audio); // Attach the audio file directly
    formData.append('name', newVoice.name || "Default Name");
    formData.append('description', newVoice.description || "Default Description");

    addVoiceMutation.mutate(formData, {
      onSettled: () => setIsAdding(false),
    });

    setNewVoice({ name: '', description: '', audio: null });
  };

  const handleDeleteVoice = (id) => {
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
      <h1 className="app-header">DeepInfra Voice Studio</h1>
      {errorMessage && <div className="error-banner" style={{ backgroundColor: 'salmon', color: 'white', padding: '10px', marginBottom: '20px' }}>{errorMessage}</div>}
      <div className="app-content">
        <div>
          <div className="api-key-section">
            <h2>API Key</h2>
            <label htmlFor="api-key">Enter your API Key </label>
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
          </div>

          <div className="add-voice-section">
            <h2>Add Voice</h2>
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
            <button onClick={handleAddVoice} disabled={isAdding} style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}>
              {isAdding ? 'Adding...' : 'Add Voice'}
            </button>
          </div>
        </div>

        <div>
          <div className="voice-management-section">
            <div className="voice-list-section">
              <h2>Voices</h2>
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
                    <p>{(new Date(voice.created_at)).toISOString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {selectedVoice && (
            <div className="api-call-section">
              <h2>API Call</h2>
              <pre style={{ fontFamily: 'Courier New, monospace', fontSize: '14px' }}>
                {
                  `fetch('${apiUrl}/inference/deepinfra/tts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ${userApiKey}',
  },
  body: JSON.stringify({
    text: "${inputText?.slice(0, 100)}",
    voice_id: "${selectedVoice?.voice_id || ''}",
    language_code: "en",
    speed: ${speed},
  })
})
  .then(response => response.json())
  .then(data => {
    console.log(data);
  })
  .catch(error => console.error(error));
  //handle and control pitch
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
  
  `
                }
              </pre>
            </div>
          )}
        </div>
        {selectedVoice && (
          <div className="voice-action-section">
            <h2>Selected Voice: {selectedVoice?.name}</h2>
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
            <button onClick={playVoice} disabled={isPlaying} style={{ fontFamily: 'Arial, sans-serif', fontSize: '16px' }}>
              {isPlaying ? 'Playing...' : 'Play Voice'}
            </button>
            <button style={{ backgroundColor: 'lightpink', fontFamily: 'Arial, sans-serif', fontSize: '16px' }} onClick={() => handleDeleteVoice(selectedVoice.voice_id)}>Delete Voice</button>
          </div>
        )}

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
