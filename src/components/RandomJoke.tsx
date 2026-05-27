import { useState } from 'react';

export default function RandomJoke() {
  const [joke, setJoke] = useState<{ setup: string; punchline: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getJoke = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/joke');
      if (!res.ok) throw new Error('Failed to fetch joke');
      const data = await res.json();
      setJoke({ setup: data.setup, punchline: data.punchline });
    } catch (e: any) {
      setError(e.message);
      setJoke(null);
    }
    setLoading(false);
  };

  return (
    <div>
      <h2>Random Joke Generator</h2>
      <button onClick={getJoke} disabled={loading}>
        {loading ? 'Loading...' : 'Tell me a joke!'}
      </button>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {joke && (
        <div style={{ marginTop: '1em' }}>
          <p><strong>{joke.setup}</strong></p>
          <p>{joke.punchline}</p>
        </div>
      )}
    </div>
  );
}
