"use client";
import React, { useState } from "react";

type Step = {
  text: string;
  detail: string;
};

type Phase = {
  id: number;
  title: string;
  category: "foundation" | "backend" | "frontend" | "fullstack" | "devops" | "testing" | "ai";
  effort: string;
  summary: string;
  why: string;
  steps: Step[];
  skills: string[];
  decisions: string[];
  dependsOn: number[];
};

const PHASES: Phase[] = [
  {
    id: 1,
    title: "JavaScript Fundamentals",
    category: "foundation",
    effort: "1-2 Weeks",
    summary: "Master the core building blocks of JavaScript. Before touching React or Node.js, you must understand how plain JavaScript works in isolation.",
    why: "Frameworks abstract away complexity, but they leak. When React or Node.js behaves unexpectedly, it's almost always a fundamental JavaScript misunderstanding.",
    steps: [
      { text: "Variables & Types", detail: "Understand let vs const vs var. Master primitive types (String, Number, Boolean, null, undefined) vs reference types (Objects, Arrays)." },
      { text: "Control Flow", detail: "If/Else, switch statements, and loops (for, while, for...of, for...in)." },
      { text: "Functions", detail: "Function declarations vs expressions. Master ES6 Arrow Functions, default parameters, and the 'arguments' object." },
      { text: "Objects & Arrays", detail: "Object methods, Iteration techniques. Master Array methods: map, filter, reduce, find, some, every." },
      { text: "ES6+ Features", detail: "Template literals, Object/Array Destructuring, and the spread/rest operators (...)." }
    ],
    skills: ["Variables", "Data Types", "Operators", "Functions", "ES6+ Syntax"],
    decisions: [
      "Always use 'const' by default. Only use 'let' if you know the value will be reassigned.",
      "Prefer ES6 Arrow Functions for callbacks to avoid 'this' binding confusion.",
      "Master map/filter/reduce instead of using basic for-loops — these functional patterns are heavily used in React."
    ],
    dependsOn: []
  },
  {
    id: 2,
    title: "Advanced JavaScript & Asynchronous Programming",
    category: "foundation",
    effort: "2 Weeks",
    summary: "Dive deeper into how the JavaScript engine actually executes code, specifically focusing on Event Loop and Asynchronous operations.",
    why: "Node.js and React both rely heavily on asynchronous non-blocking operations. You cannot build modern web apps without mastering Promises and the Event Loop.",
    steps: [
      { text: "Scope & Closures", detail: "Understand Lexical Scoping. Master Closures: how functions retain access to their outer scope even after execution." },
      { text: "The 'this' Keyword", detail: "Learn how context changes in regular functions vs arrow functions, and how to use bind/call/apply." },
      { text: "Asynchronous JavaScript", detail: "Understand the visual flow of Callbacks → Promises → async/await." },
      { text: "The Event Loop", detail: "Learn the Call Stack, Web APIs, Macrotask Queue (setTimeout) vs Microtask Queue (Promises)." },
      { text: "Fetch API", detail: "Make actual HTTP GET/POST requests to external APIs using fetch() and async/await." }
    ],
    skills: ["Closures", "Promises", "async/await", "Event Loop", "Fetch API"],
    decisions: [
      "Always prefer async/await over raw .then()/.catch() chains for readability and easier try/catch error handling.",
      "Never block the main thread. Heavy computations must be sent to worker threads (or better, handled by a backend like FastAPI)."
    ],
    dependsOn: [1]
  },
  {
    id: 3,
    title: "Node.js Basics",
    category: "backend",
    effort: "1-2 Weeks",
    summary: "Take JavaScript outside the browser and onto the server using the Node.js runtime environment.",
    why: "Next.js executes code on both the client (browser) and the server (Node.js). Understanding the Node.js environment is critical for building full-stack applications.",
    steps: [
      { text: "Node Runtime Architecture", detail: "Understand V8 engine, Libuv, and how Node achieves asynchronous I/O." },
      { text: "Modules Systems", detail: "Learn the difference between CommonJS (require/module.exports) and ES Modules (import/export)." },
      { text: "Core Modules", detail: "Master 'fs' (File System) for reading/writing files, and 'path' for resolving directory structures." },
      { text: "Package Management", detail: "Learn how to use npm, package.json dependencies, and run scripts." },
      { text: "Basic Server architecture", detail: "Build a raw HTTP server using the built-in 'http' module, then upgrade to a basic Express.js app to understand routing." }
    ],
    skills: ["CommonJS / ESM", "File System API", "NPM", "Env Vars", "Basic HTTP"],
    decisions: [
      "Default to ES Modules (import/export) in modern Node.js development. Set 'type': 'module' in package.json.",
      "Use environment variables (.env files via 'dotenv' package) for secrets right from the start. Never hardcode API keys."
    ],
    dependsOn: [1, 2]
  },
  {
    id: 4,
    title: "Python Fundamentals & Type Hinting",
    category: "foundation",
    effort: "1-2 Weeks",
    summary: "Learn the core syntax of Python and, critically, master Python Type Hints which are the backbone of FastAPI.",
    why: "FastAPI is heavily reliant on modern Python features (like Pydantic and Type Hints). You cannot write FastAPI effectively if you write Python like it's 2012.",
    steps: [
      { text: "Python Core Syntax", detail: "Variables, Lists, Dictionaries, Sets, Tuples, and Control Flow (if, for, while)." },
      { text: "Functions & Classes", detail: "def functions, *args, **kwargs, and Object-Oriented basic classes (__init__)." },
      { text: "List/Dict Comprehensions", detail: "Master Python's elegant syntactical shortcuts for generating loops and transformations." },
      { text: "Type Hinting (Critical)", detail: "Learn how to annotate variables, function arguments, and return types (e.g., def process(data: list[int]) -> str:)." },
      { text: "Pydantic Basics", detail: "Learn how Pydantic heavily leverages Type Hints to enforce data validation automatically." }
    ],
    skills: ["Dictionaries", "List Comprehensions", "Type Hints (typing)", "*args/**kwargs", "Pydantic"],
    decisions: [
      "Always type hint your function parameters and return types. It makes your code self-documenting and IDEs will catch bugs for you.",
      "Use Pytest for writing python tests. It is the industry standard and beautifully concise."
    ],
    dependsOn: []
  },
  {
    id: 5,
    title: "FastAPI Basics",
    category: "backend",
    effort: "1-2 Weeks",
    summary: "Build high-performance REST APIs quickly using FastAPI, Pydantic, and Uvicorn.",
    why: "FastAPI uses Python's type hints to automatically generate OpenAPI documentation and handle JSON validation, eliminating thousands of lines of boilerplate.",
    steps: [
      { text: "Initial Setup", detail: "Install FastAPI and Uvicorn. Write your first @app.get('/') route and start the ASGI server." },
      { text: "Path & Query Parameters", detail: "Learn how FastAPI distinguishes between /items/{id} (path) and /items?skip=0 (query) automatically." },
      { text: "Request Bodies", detail: "Create a Pydantic BaseModel to accept POST request JSON data with instant automatic validation." },
      { text: "OpenAPI Documentation", detail: "Navigate to /docs and see how FastAPI generates Swagger UI interactively." },
      { text: "Dependency Injection Basics", detail: "Master the Depends() system to extract shared logic (like database connections or token extraction)." }
    ],
    skills: ["FastAPI Routing", "Uvicorn ASGI", "Automatic docs", "HTTP Methods (GET/POST)", "Dependency Injection"],
    decisions: [
      "Let Pydantic do the heavily lifting. Don't write 'if not request.get(\"email\"): return 400'. Define an EmailStr in the Pydantic model.",
      "Use generator functions (`yield`) inside Dependencies (Depends()) for database connections to guarantee cleanup even if exceptions occur."
    ],
    dependsOn: [4]
  },
  {
    id: 6,
    title: "Advanced FastAPI & Database Integration",
    category: "backend",
    effort: "2 Weeks",
    summary: "Connect FastAPI to a real persistence layer and handle complex production requirements like Authentication and Background Tasks.",
    why: "A stateless API is nice, but real applications need to store data, authenticate users, and process long-running tasks asynchronously.",
    steps: [
      { text: "Database Setup", detail: "Integrate a SQL database using pure SQL (DuckDB/SQLite) or an ORM like SQLAlchemy." },
      { text: "Structuring Large Apps", detail: "Organize the codebase using APIRouter to prevent main.py from becoming a 2000-line monolith." },
      { text: "Authentication", detail: "Implement OAuth2 with Password Bearer flow. Generate and verify JWT (JSON Web Tokens)." },
      { text: "Background Tasks", detail: "Use FastAPI's BackgroundTasks to offload slow operations (e.g. sending emails) after returning an immediate HTTP response." },
      { text: "CORS (Cross-Origin Resource Sharing)", detail: "Configure CORSMiddleware so your frontend (on port 3000) can securely talk to your backend (on port 8000)." }
    ],
    skills: ["SQLAlchemy / SQL", "JWT Auth", "OAuth2", "APIRouter", "BackgroundTasks"],
    decisions: [
      "Use APIRouter to split your endpoints into domains (e.g. users.py, tasks.py, auth.py).",
      "Always hash passwords using Passlib + bcrypt before saving to the database. Never store plaintext passwords.",
      "Understand CORS errors deeply—they are the \#1 complaint when connecting a new frontend to a backend."
    ],
    dependsOn: [5]
  },
  {
    id: 7,
    title: "React Fundamentals",
    category: "frontend",
    effort: "2-3 Weeks",
    summary: "Learn the core React philosophy. Next.js is a React framework, so you must master pure React before using Next.js.",
    why: "Skipping straight to Next.js without knowing React causes deep confusion between Server and Client components, and leads to poorly structured component trees.",
    steps: [
      { text: "Thinking in React", detail: "Understand Component-Based Architecture and declarative UI. UI = function(state)." },
      { text: "JSX & Props", detail: "Write HTML-in-JS (JSX). Learn how to pass data down the tree via Props, and how Data Flows One Way." },
      { text: "State Management", detail: "Master the `useState` hook. Understand that state changes trigger automatic re-renders." },
      { text: "Side Effects", detail: "Master the `useEffect` hook. Learn dependency arrays, cleanup functions, and how to safely fetch API data on mount." },
      { text: "Context API & Refs", detail: "Learn `useContext` to avoid Prop Drilling. Use `useRef` to directly manipulate DOM elements bypassing the React lifecycle." }
    ],
    skills: ["JSX", "useState", "useEffect", "React Composition", "Prop Drilling"],
    decisions: [
      "Never mutate state directly (e.g., `state.items.push(x)`). Always use proper setter functions with new object references (`setItems([...items, x])`).",
      "Treat `useEffect` as an escape hatch, not a default lifecycle method. Most derived state can be calculated directly during render."
    ],
    dependsOn: [1, 2]
  },
  {
    id: 8,
    title: "Next.js App Router (Beginner)",
    category: "frontend",
    effort: "2 Weeks",
    summary: "Transition from pure React to the Next.js App Router framework, prioritizing Server Components and file-system based routing.",
    why: "Next.js solves React's biggest weaknesses (SEO, bundle size, routing boilerplate) by moving rendering to the server where possible.",
    steps: [
      { text: "File-System Routing", detail: "Understand how folders become routes (app/dashboard/page.tsx -> /dashboard). Master layout.tsx vs page.tsx." },
      { text: "Server vs Client Components", detail: "Understand React Server Components (RSC). Learn when and why to add the `'use client'` directive to a file." },
      { text: "Data Fetching (Server-Side)", detail: "Fetch data directly inside async Server Components without needing useEffect or API routes." },
      { text: "Styling Integration", detail: "Standardize your styling approach. Use Tailwind CSS utilities or CSS Modules / Custom Properties." },
      { text: "Dynamic Routes", detail: "Create dynamic segments like `app/users/[id]/page.tsx` and access the params prop." }
    ],
    skills: ["App Router", "Server Components", "Client boundaries", "layout.tsx", "Tailwind CSS"],
    decisions: [
      "Build everything as a Server Component by default. Only opt-in to 'use client' when you explicitly need `useState`, `onClick` listeners, or browser APIs.",
      "Fetch data as high up in the Server Component tree as possible, and pass the resolved data down to interactive Client Components as props."
    ],
    dependsOn: [7, 3]
  },
  {
    id: 9,
    title: "Advanced Next.js & Optimization",
    category: "fullstack",
    effort: "2 Weeks",
    summary: "Leverage advanced Next.js features like Server Actions, Streaming, and Cache controls to build production-grade interfaces.",
    why: "To build fast, resilient applications, you need to understand how Next.js caches data, handles loading states, and processes secure mutations.",
    steps: [
      { text: "Server Actions", detail: "Use asynchronous functions (`'use server'`) to handle form submissions and database mutations directly from the client without writing dedicated API routes." },
      { text: "Caching & Revalidation", detail: "Understand Next.js Request Memoization, Data Cache, and Full Route Cache. Learn `revalidatePath` and `revalidateTag`." },
      { text: "Streaming & Suspense", detail: "Use `loading.tsx` and `<Suspense fallback={...}>` to stream UI to the browser before data fetching is fully complete." },
      { text: "Middleware", detail: "Write `middleware.ts` to intercept requests at the edge (useful for Auth redirects or locale processing)." },
      { text: "SEO & Metadata", detail: "Dynamically generate `<title>` and `<meta>` tags using the `generateMetadata()` function." }
    ],
    skills: ["Server Actions", "Suspense / Streaming", "Next.js Caching", "Middleware", "SEO Optimization"],
    decisions: [
      "Use Server Actions for mutations whenever possible—they automatically tie into the Next.js cache revalidation workflow.",
      "Wrap slow database queries in `<Suspense>` boundaries so the rest of the page loads instantly while the slow data streams in."
    ],
    dependsOn: [8]
  },
  {
    id: 10,
    title: "Full-Stack Deployment & DevOps",
    category: "devops",
    effort: "1-2 Weeks",
    summary: "Unify the backend and frontend. Containerize the entire application using Docker, and deploy it to local or cloud environments.",
    why: "Software isn't finished until it's deployed. Mastering basic DevOps guarantees your code works anywhere, not just on 'your machine'.",
    steps: [
      { text: "Environment Segregation", detail: "Master .env files. Understand the difference between NEXT_PUBLIC_ variables (baked into frontend) vs private backend secrets." },
      { text: "Local Integration Networking", detail: "Connect your Next.js frontend to the FastAPI backend. Manage internal SSR fetching (http://backend:8000) vs Client fetching (from browser to localhost:8000)." },
      { text: "Writing Dockerfiles", detail: "Write a Multi-Stage Dockerfile for the Next.js production build, and a streamlined Python Dockerfile for FastAPI." },
      { text: "Docker Compose", detail: "Orchestrate both containers using `docker-compose.yml`. Introduce Docker Volumes for persistent database storage." },
      { text: "CI/CD & Deployment", detail: "Set up basic GitHub actions to run tests. Deploy Next.js to Vercel, and FastAPI to platforms like Render, Railway, or AWS." }
    ],
    skills: ["Docker Multi-stage", "Docker Compose", "CORS & Networking", "Environment Variables", "CI/CD"],
    decisions: [
      "Never commit your .env file. Provide a dummy .env.example for other developers.",
      "Use Docker Compose named volumes instead of bind-mounting local directories for databases so data isn't accidentally wiped.",
      "Enforce strict CORS on production deployments (allow only your frontend domain) while allowing '*' locally."
    ],
    dependsOn: [6, 9]
  }
];

const CATEGORY_META: Record<Phase["category"], { label: string; className: string }> = {
  foundation: { label: "Foundation",  className: "phase-cat--foundation" },
  backend:    { label: "Backend",     className: "phase-cat--backend" },
  frontend:   { label: "Frontend",    className: "phase-cat--frontend" },
  fullstack:  { label: "Full-Stack",  className: "phase-cat--fullstack" },
  devops:     { label: "DevOps",      className: "phase-cat--devops" },
  testing:    { label: "Testing",     className: "phase-cat--testing" },
  ai:         { label: "AI",          className: "phase-cat--ai" },
};

function PhaseCard({ phase, isExpanded, onToggle }: {
  phase: Phase;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const cat = CATEGORY_META[phase.category];

  return (
    <div className={`roadmap-phase-card${isExpanded ? " roadmap-phase-card--expanded" : ""}`}>
      <div className="roadmap-phase-header" onClick={onToggle}>
        <div className="roadmap-phase-header-left">
          <span className="roadmap-phase-num">Phase {phase.id}</span>
          <h3 className="roadmap-phase-title">{phase.title}</h3>
          <span className={`roadmap-phase-cat ${cat.className}`}>{cat.label}</span>
        </div>
        <div className="roadmap-phase-header-right">
          <span className="roadmap-phase-effort">{phase.effort}</span>
          <button
            className="roadmap-expand-btn"
            aria-label={isExpanded ? "collapse" : "expand"}
            onClick={e => { e.stopPropagation(); onToggle(); }}
          >
            {isExpanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      <p className="roadmap-phase-summary">{phase.summary}</p>

      {isExpanded && (
        <div className="roadmap-phase-body">
          <div className="roadmap-section">
            <h4 className="roadmap-section-title">Why this phase matters</h4>
            <p className="roadmap-section-text">{phase.why}</p>
          </div>

          <div className="roadmap-section">
            <h4 className="roadmap-section-title">Implementation steps</h4>
            <ol className="roadmap-steps-list">
              {phase.steps.map((step, i) => (
                <li key={i} className="roadmap-step-item">
                  <span className="roadmap-step-text">{step.text}</span>
                  <span className="roadmap-step-detail">{step.detail}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="roadmap-meta-row">
            <div className="roadmap-section roadmap-section--half">
              <h4 className="roadmap-section-title">Key decisions & gotchas</h4>
              <ul className="roadmap-decisions-list">
                {phase.decisions.map((d, i) => (
                  <li key={i} className="roadmap-decision-item">{d}</li>
                ))}
              </ul>
            </div>

            <div className="roadmap-section roadmap-section--half">
              <h4 className="roadmap-section-title">Skills required</h4>
              <div className="roadmap-skills-chips">
                {phase.skills.map(s => (
                  <span key={s} className="roadmap-skill-chip">{s}</span>
                ))}
              </div>
              {phase.dependsOn.length > 0 && (
                <div className="roadmap-depends">
                  <span className="roadmap-depends-label">Depends on:</span>
                  {phase.dependsOn.map(id => (
                    <span key={id} className="roadmap-depends-chip">Phase {id}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function RoadmapView() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const totalEffortHint = "~3–4 months for a dedicated beginner";

  return (
    <div className="roadmap-view">
      <div className="roadmap-header">
        <h2 className="roadmap-heading">Full-Stack Developer Learning Roadmap</h2>
        <p className="roadmap-subheading">
          A comprehensive JavaScript, Node.js, Python, FastAPI, and Next.js curriculum — 10 phases, ordered by dependency, with topics, decisions, and goals for each phase.
        </p>
        <div className="roadmap-meta-bar">
          <span className="roadmap-meta-item"><strong>{PHASES.length}</strong> phases</span>
          <span className="roadmap-meta-sep" />
          <span className="roadmap-meta-item"><strong>{PHASES.reduce((s, p) => s + p.steps.length, 0)}</strong> implementation steps</span>
          <span className="roadmap-meta-sep" />
          <span className="roadmap-meta-item">{totalEffortHint}</span>
        </div>
        <div className="roadmap-legend">
          {Object.entries(CATEGORY_META).map(([key, val]) => (
            <span key={key} className={`roadmap-phase-cat ${val.className}`}>{val.label}</span>
          ))}
        </div>
      </div>

      <div className="roadmap-timeline">
        {PHASES.map(phase => (
          <div key={phase.id} className="roadmap-timeline-row">
            <div className="roadmap-timeline-spine">
              <div className={`roadmap-timeline-dot roadmap-timeline-dot--${phase.category}`} />
              {phase.id < PHASES.length - 1 && <div className="roadmap-timeline-line" />}
            </div>
            <PhaseCard
              phase={phase}
              isExpanded={expandedId === phase.id}
              onToggle={() => setExpandedId(expandedId === phase.id ? null : phase.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
