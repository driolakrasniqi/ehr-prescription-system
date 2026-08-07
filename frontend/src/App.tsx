import { useEffect, useState } from "react";

interface HealthResponse {
  success: boolean;
  message: string;
  database?: {
    databaseName: string;
    databaseVersion: string;
    utcTime: string;
  };
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHealth(): Promise<void> {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;

        console.log("API URL:", apiUrl);

        const response = await fetch(`${apiUrl}/health`, {
          credentials: "include"
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = (await response.json()) as HealthResponse;

        setHealth(result);
      } catch (requestError) {
        console.error(requestError);

        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unknown API error"
        );
      }
    }

    void loadHealth();
  }, []);

  return (
    <main
      style={{
        padding: "2rem",
        fontFamily: "Arial, sans-serif",
        textAlign: "center"
      }}
    >
      <h1>EHR and E-Prescription System</h1>

      {error && <p>Backend error: {error}</p>}

      {!error && !health && <p>Checking backend...</p>}

      {health && (
        <section>
          <p>{health.message}</p>

          <p>
            Database:
            {" "}
            {health.database?.databaseName}
          </p>

          <p>
            MySQL:
            {" "}
            {health.database?.databaseVersion}
          </p>
        </section>
      )}
    </main>
  );
}

export default App;