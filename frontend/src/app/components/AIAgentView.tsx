import React, { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "ai";
  text: string;
};

type Props = {
  apiUrl: string;
  refreshData: () => Promise<void>;
};

export const AIAgentView = ({ apiUrl, refreshData }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleGenerateSummary = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/ai/summary`, { method: "POST" });
      const data = await res.json();
      setSummary(data.summary);
    } catch (err) {
      console.error("Failed to generate summary", err);
      alert("Error generating summary. Make sure backend is running.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch(`${apiUrl}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "ai", text: data.response }]);
      
      // If the AI performed an action, trigger a data refresh after a short delay
      // to allow the backend DB connection to release
      if (data.refresh_required) {
        setTimeout(() => { refreshData().catch(() => {}); }, 500);
      }
    } catch (err) {
      console.error("Failed to send chat", err);
      setMessages((prev) => [
        ...prev,
        { role: "ai", text: "Sorry, I encountered an error processing your request." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="section ai-agent-section">
      <div className="ai-agent-header">
        <h2>🤖 AI Work Assistant</h2>
        <button 
          className="btn-primary" 
          onClick={handleGenerateSummary}
          disabled={isLoading}
        >
          {isLoading ? "Generating..." : "✨ Generate Weekly Summary"}
        </button>
      </div>

      {summary && (
        <div className="ai-summary-card">
          <div className="ai-summary-content">
            <div dangerouslySetInnerHTML={{ __html: summary.replace(/\n/g, '<br/>') }} />
          </div>
          <button className="btn-secondary btn-sm" onClick={() => setSummary(null)}>Clear Summary</button>
        </div>
      )}

      <div className="ai-chat-container">
        <div className="ai-chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              Ask me anything about your work history, e.g., "What did I accomplish yesterday?" or "Which tasks are overdue?"
              <br/><br/>
              <strong>Action Examples:</strong>
              <ul style={{ listStyle: 'none', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <li>"Create a task for API documentation"</li>
                <li>"Add an update to the Login task saying it's 50% done"</li>
                <li>"Schedule a 1 hour block for task X tomorrow at 10am"</li>
              </ul>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
                <div className="chat-bubble-label">{m.role === 'ai' ? 'AI Assistant' : 'You'}</div>
                <div className="chat-bubble-text">{m.text}</div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="ai-chat-input-form" onSubmit={handleSendChat}>
          <input
            className="input-field chat-input"
            placeholder="Type your question or action..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
          />
          <button type="submit" className="btn-primary chat-send-btn" disabled={isLoading || !input.trim()}>
            {isLoading ? "..." : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
};
