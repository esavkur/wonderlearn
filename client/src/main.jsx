import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import { marked } from "marked";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bookmark,
  BookMarked,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Highlighter,
  Home,
  Image,
  Library,
  LogOut,
  Moon,
  NotebookPen,
  RotateCcw,
  Search,
  Shield,
  Sun,
  Trophy,
  Users,
  Volume2,
  Play,
  Pause,
  Square,
  Copy,
  X,
} from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import "./styles.css";

/*
  IMPORTANT:
  Copy the worker file with:

  mkdir -p public
  cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs
*/
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const RUNTIME_CONFIG = window.__WONDERLEARN_CONFIG__ || {};

const API =
  RUNTIME_CONFIG.API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "/api";

const API_ORIGIN = API.replace(/\/api\/?$/, "");

function getDefaultBooksBaseUrl() {
  const hostname = window.location.hostname;

  if (hostname.includes("app-wonderlearn-frontend-prod-")) {
    return "https://stwonderlearnprodsk85wl2.blob.core.windows.net/books";
  }

  if (hostname.includes("app-wonderlearn-frontend-dev-")) {
    return "https://stwonderlearndevsk85wl2.blob.core.windows.net/books";
  }

  return "";
}

const BOOKS_BASE_URL =
  RUNTIME_CONFIG.BOOKS_BASE_URL ||
  import.meta.env.VITE_BOOKS_BASE_URL ||
  getDefaultBooksBaseUrl();

function resolveAssetUrl(value) {
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value) || value.startsWith("blob:")) {
    return value;
  }

  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  return `${API_ORIGIN}${normalizedPath}`;
}

function resolvePdfUrl(value) {
  if (!value) {
    return "";
  }

  if (/^https?:\/\//i.test(value) || value.startsWith("blob:")) {
    return value;
  }

  const relativePath = value
    .replace(/^\/?books\//i, "")
    .replace(/^\/+/, "");

  if (BOOKS_BASE_URL) {
    return `${BOOKS_BASE_URL.replace(/\/$/, "")}/${relativePath}`;
  }

  return resolveAssetUrl(value);
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem("wlpro") || "null");
  } catch {
    return null;
  }
}

async function api(path, options = {}) {
  const currentSession = getSession();

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(currentSession?.token
        ? { Authorization: `Bearer ${currentSession.token}` }
        : {}),
      ...(options.headers || {}),
    },
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.message || `Request failed: ${response.status}`);
  }

  return body;
}

function Layout({ children }) {
  const navigate = useNavigate();
  const user = getSession()?.user;
  const [dark, setDark] = useState(localStorage.getItem("dark") === "1");

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
  }, [dark]);

  function toggleDarkMode() {
    const next = !dark;
    setDark(next);
    localStorage.setItem("dark", next ? "1" : "0");
  }

  function logout() {
    localStorage.removeItem("wlpro");
    navigate("/login");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span>W</span>
          WonderLearn
        </Link>

        <nav>
          <Link to="/">
            <Home />
            Home
          </Link>

          <Link to="/library">
            <Library />
            Library
          </Link>

          <Link to="/dashboard">
            <BarChart3 />
            My learning
          </Link>

          {user?.role === "parent" && (
            <Link to="/parent">
              <Users />
              Parent view
            </Link>
          )}

          {user?.role === "admin" && (
            <Link to="/admin">
              <Shield />
              Admin
            </Link>
          )}
        </nav>

        <div className="sideBottom">
          <button type="button" onClick={toggleDarkMode}>
            {dark ? <Sun /> : <Moon />}
            {dark ? "Light mode" : "Dark mode"}
          </button>

          <button type="button" onClick={logout}>
            <LogOut />
            Logout
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header>
          <div>
            <b>{user?.name}</b>
            <small>
              {user?.role} • Class {user?.classLevel}
            </small>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

function Auth() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "student@example.com",
    password: "Student@123",
    classLevel: 6,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const data = await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(form),
      });

      localStorage.setItem("wlpro", JSON.stringify(data));
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <section>
        <span className="kicker">NCERT + AI</span>
        <h1>A personal tutor inside every textbook.</h1>
        <p>
          Read, highlight, understand, quiz yourself and continue from any
          device.
        </p>
      </section>

      <form onSubmit={submit}>
        <div className="authTabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Login
          </button>

          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>

        {mode === "register" && (
          <label>
            Name
            <input
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
        )}

        <label>
          Email
          <input
            value={form.email}
            onChange={(event) =>
              setForm({ ...form, email: event.target.value })
            }
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) =>
              setForm({ ...form, password: event.target.value })
            }
          />
        </label>

        {mode === "register" && (
          <label>
            Class
            <select
              value={form.classLevel}
              onChange={(event) =>
                setForm({ ...form, classLevel: Number(event.target.value) })
              }
            >
              {[6, 7, 8, 9, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}

        {error && <div className="error">{error}</div>}

        <button className="primary" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Enter learning space"
              : "Create account"}
        </button>
      </form>
    </main>
  );
}

function HomePage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard")
      .then(setDashboard)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <main className="content">
        {error && <div className="error">{error}</div>}

        <section className="heroPro">
          <div>
            <span className="kicker">YOUR LEARNING SPACE</span>
            <h1>Small steps. Big understanding.</h1>
            <p>
              Continue a book, protect your streak, or turn a difficult
              paragraph into a simple explanation.
            </p>

            <button
              className="primary inline"
              type="button"
              onClick={() => navigate("/library")}
            >
              Explore library
              <ArrowRight />
            </button>
          </div>

          <div className="streak">
            <Trophy />
            <b>{dashboard?.streak || 0}</b>
            <span>day streak</span>
          </div>
        </section>

        <section className="stats">
          <article>
            <BookOpen />
            <div>
              <b>{dashboard?.progress?.length || 0}</b>
              <span>Books started</span>
            </div>
          </article>

          <article>
            <NotebookPen />
            <div>
              <b>
                {dashboard?.progress?.reduce(
                  (total, progress) => total + (progress.notes?.length || 0),
                  0,
                ) || 0}
              </b>
              <span>Saved notes</span>
            </div>
          </article>

          <article>
            <ClipboardCheck />
            <div>
              <b>{dashboard?.attempts?.length || 0}</b>
              <span>Quiz attempts</span>
            </div>
          </article>
        </section>

        <h2>Continue learning</h2>

        <section className="continueGrid">
          {dashboard?.progress?.slice(0, 4).map((progress) => (
            <article key={progress._id}>
              <img
                src={resolveAssetUrl(progress.book.coverPath)}
                alt={`${progress.book.title} cover`}
              />

              <div>
                <small>{progress.book.subject}</small>
                <h3>{progress.book.title}</h3>

                <div className="bar">
                  <i style={{ width: `${progress.percent}%` }} />
                </div>

                <p>
                  {progress.percent}% complete • Page {progress.currentPage}
                </p>

                <button
                  type="button"
                  onClick={() => navigate(`/reader/${progress.book._id}`)}
                >
                  Continue
                  <ArrowRight />
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </Layout>
  );
}

function LibraryPage() {
  const user = getSession()?.user;
  const navigate = useNavigate();

  const [classLevel, setClassLevel] = useState(user?.classLevel || 6);
  const [books, setBooks] = useState([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("All");
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");

    api(`/books?classLevel=${classLevel}`)
      .then(setBooks)
      .catch((err) => setError(err.message));
  }, [classLevel]);

  const subjects = useMemo(
    () => ["All", ...new Set(books.map((book) => book.subject))],
    [books],
  );

  const visibleBooks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return books.filter((book) => {
      const matchesSubject =
        subject === "All" || book.subject === subject;

      const matchesQuery =
        !normalizedQuery ||
        `${book.title} ${book.subject}`
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesSubject && matchesQuery;
    });
  }, [books, query, subject]);

  return (
    <Layout>
      <main className="content">
        {error && <div className="error">{error}</div>}

        <div className="titleRow">
          <div>
            <span className="kicker">41 UPLOADED BOOKS</span>
            <h1>NCERT Library</h1>
          </div>

          <label className="search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search book or subject"
            />
          </label>
        </div>

        <div className="classRow">
          {[6, 7, 8, 9, 10].map((value) => (
            <button
              key={value}
              type="button"
              className={value === classLevel ? "active" : ""}
              onClick={() => {
                setClassLevel(value);
                setSubject("All");
              }}
            >
              Class {value}
            </button>
          ))}
        </div>

        <div className="chips">
          {subjects.map((value) => (
            <button
              key={value}
              type="button"
              className={value === subject ? "active" : ""}
              onClick={() => setSubject(value)}
            >
              {value}
            </button>
          ))}
        </div>

        <section className="bookGrid">
          {visibleBooks.map((book) => (
            <article key={book._id}>
              <div className="bookCover">
                <img
                  src={resolveAssetUrl(book.coverPath)}
                  alt={`${book.title} cover`}
                />
              </div>

              <div className="bookInfo">
                <small>
                  CLASS {book.classLevel} • {book.subject}
                </small>

                <h3>{book.title}</h3>
                <p>{book.pageCount} pages</p>

                <button
                  type="button"
                  onClick={() => navigate(`/reader/${book._id}`)}
                >
                  Open reader
                  <ArrowRight />
                </button>
              </div>
            </article>
          ))}
        </section>
      </main>
    </Layout>
  );
}

function ReaderPage() {
  const { id } = useParams();

  const [book, setBook] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [pdf, setPdf] = useState(null);

  const [pdfBlobUrl, setPdfBlobUrl] = useState("");
  const [pdfError, setPdfError] = useState("");

  const [term, setTerm] = useState("");
  const [hits, setHits] = useState([]);
  const [panel, setPanel] = useState(null);

  const [selected, setSelected] = useState("");
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [visualBusy, setVisualBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);

  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState([]);

  const stage = useRef(null);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function loadBookAndProgress() {
      try {
        const [loadedBook, loadedProgress] = await Promise.all([
          api(`/books/${id}`),
          api(`/progress/${id}`),
        ]);

        if (cancelled) {
          return;
        }

        setBook(loadedBook);

        if (loadedProgress?.currentPage) {
          setPage(loadedProgress.currentPage);
        }
      } catch (error) {
        if (!cancelled) {
          setPdfError(error.message);
        }
      }
    }

    loadBookAndProgress();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /*
    Fetch the PDF through the Vite proxy and expose it as a Blob URL.

    This avoids the detached ArrayBuffer problem that can happen when PDF.js
    transfers a Uint8Array to its worker and React reuses the same data.
  */
  useEffect(() => {
    if (!book?.pdfPath) {
      return undefined;
    }

    let cancelled = false;
    let createdBlobUrl = "";

    async function loadPdfFile() {
      setPdfBlobUrl("");
      setPdfError("");
      setPdf(null);
      setPages(1);

      try {
        const resolvedPdfUrl = resolvePdfUrl(book.pdfPath);
        console.log("Loading PDF from:", resolvedPdfUrl);

        const response = await fetch(resolvedPdfUrl, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            `PDF request failed: ${response.status} ${response.statusText}`,
          );
        }

        const blob = await response.blob();

        if (!blob.size) {
          throw new Error("Received an empty PDF file");
        }

        const pdfBlob = new Blob([blob], {
          type: "application/pdf",
        });

        createdBlobUrl = URL.createObjectURL(pdfBlob);

        if (!cancelled) {
          setPdfBlobUrl(createdBlobUrl);
        }
      } catch (error) {
        console.error("PDF fetch error:", error);

        if (!cancelled) {
          setPdfError(error.message);
        }
      }
    }

    loadPdfFile();

    return () => {
      cancelled = true;

      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [book?.pdfPath]);

  useEffect(() => {
    if (!book || pages < 1) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const readingSeconds = Math.max(
        0,
        Math.floor((Date.now() - startedAt.current) / 1000),
      );

      startedAt.current = Date.now();

      api(`/progress/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          currentPage: page,
          totalPages: pages,
          readingSeconds,
        }),
      }).catch((error) => {
        console.error("Progress save failed:", error);
      });
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [page, pages, book, id]);


  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  function cleanTextForSpeech(value) {
    return String(value || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*_`~\-]+/g, " ")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function chooseIndianVoice() {
    const voices = window.speechSynthesis?.getVoices?.() || [];

    return (
      voices.find((voice) => voice.lang === "hi-IN") ||
      voices.find((voice) => voice.lang === "en-IN") ||
      voices.find((voice) => voice.lang?.startsWith("hi")) ||
      voices.find((voice) => voice.lang?.startsWith("en")) ||
      voices[0]
    );
  }

  function startReadAloud() {
    const explanation = answer?.explanation;
    if (!explanation || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      cleanTextForSpeech(explanation),
    );
    const voice = chooseIndianVoice();

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-IN";
    }

    utterance.rate = speechRate;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      setSpeaking(true);
      setSpeechPaused(false);
    };
    utterance.onend = () => {
      setSpeaking(false);
      setSpeechPaused(false);
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setSpeechPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }

  function pauseOrResumeSpeech() {
    if (!window.speechSynthesis) return;

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setSpeechPaused(false);
    } else {
      window.speechSynthesis.pause();
      setSpeechPaused(true);
    }
  }

  function stopSpeech() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setSpeechPaused(false);
  }

  function changeSpeechRate(event) {
    const nextRate = Number(event.target.value);
    setSpeechRate(nextRate);

    if (speaking) {
      stopSpeech();
    }
  }

  async function generateDiagram() {
    if (!selected || visualBusy) return;

    setVisualBusy(true);

    try {
      const result = await api("/ai/visual", {
        method: "POST",
        body: JSON.stringify({
          selectedText: selected,
          classLevel: book.classLevel,
          subject: book.subject,
        }),
      });

      setAnswer((current) => ({
        ...(current || {}),
        visual: result.visual,
        visualError: "",
      }));
    } catch (error) {
      setAnswer((current) => ({
        ...(current || {}),
        visualError: error.message,
      }));
    } finally {
      setVisualBusy(false);
    }
  }

  async function copyExplanation() {
    if (!answer?.explanation) return;

    await navigator.clipboard.writeText(
      cleanTextForSpeech(answer.explanation),
    );
    window.alert("Explanation copied.");
  }

  function captureSelection() {
    const text = window.getSelection()?.toString().trim();

    if (text && text.length > 1) {
      stopSpeech();
      setSelected(text.slice(0, 5000));
      setPanel("ai");
      setAnswer(null);
    }
  }

  async function searchPdf(event) {
    event.preventDefault();

    const searchTerm = term.trim();

    if (!pdf || !searchTerm) {
      return;
    }

    setBusy(true);

    try {
      const found = [];

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const pdfPage = await pdf.getPage(pageNumber);
        const content = await pdfPage.getTextContent();
        const text = content.items.map((item) => item.str).join(" ");
        const normalizedText = text.toLowerCase();
        const index = normalizedText.indexOf(searchTerm.toLowerCase());

        if (index >= 0) {
          found.push({
            page: pageNumber,
            snippet: text.slice(
              Math.max(0, index - 70),
              index + searchTerm.length + 110,
            ),
          });
        }

        if (found.length >= 20) {
          break;
        }
      }

      setHits(found);
      setPanel("search");
    } catch (error) {
      setHits([]);
      setAnswer({ error: error.message });
      setPanel("ai");
    } finally {
      setBusy(false);
    }
  }

  async function explain() {
    if (!selected) {
      return;
    }

    setBusy(true);
    setAnswer({ explanation: "", visual: null });

    let fullText = "";

    try {
      const currentSession = getSession();
      const response = await fetch(`${API}/ai/explain-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentSession.token}`,
        },
        body: JSON.stringify({
          selectedText: selected,
          classLevel: book.classLevel,
          subject: book.subject,
          language: "Hinglish",
        }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Unable to start AI response");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const rawEvent of events) {
          const line = rawEvent
            .split("\n")
            .find((item) => item.startsWith("data: "));
          if (!line) continue;

          const data = JSON.parse(line.slice(6));

          if (data.type === "delta") {
            fullText += data.text;
            setAnswer({ explanation: fullText, visual: null });
          }

          if (data.type === "error") {
            throw new Error(data.message);
          }
        }
      }

      if (!fullText.trim()) {
        throw new Error("AI returned an empty response");
      }

      await api(`/progress/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          page,
          selectedText: selected,
          aiExplanation: fullText,
          text: "",
        }),
      });
    } catch (error) {
      setAnswer({ error: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function generateVisual() {
    if (!selected) return;

    setBusy(true);

    try {
      const result = await api("/ai/visual", {
        method: "POST",
        body: JSON.stringify({
          selectedText: selected,
          classLevel: book.classLevel,
          subject: book.subject,
        }),
      });

      setAnswer((current) => ({
        ...(current || {}),
        visual: result.visual,
      }));
    } catch (error) {
      setAnswer((current) => ({
        ...(current || {}),
        visualError: error.message,
      }));
    } finally {
      setBusy(false);
    }
  }

  async function makeQuiz() {
    setBusy(true);

    try {
      const result = await api("/ai/quiz", {
        method: "POST",
        body: JSON.stringify({
          bookId: id,
          page,
          subject: book.subject,
          classLevel: book.classLevel,
          topic: selected || term || book.title,
        }),
      });

      setQuiz(result);
      setAnswers([]);
      setPanel("quiz");
    } catch (error) {
      setAnswer({ error: error.message });
      setPanel("ai");
    } finally {
      setBusy(false);
    }
  }

  async function submitQuiz() {
    if (!quiz?._id) {
      return;
    }

    try {
      const result = await api(`/quizzes/${quiz._id}/submit`, {
        method: "PUT",
        body: JSON.stringify({ answers }),
      });

      setQuiz(result);
    } catch (error) {
      setAnswer({ error: error.message });
      setPanel("ai");
    }
  }

  async function bookmarkPage() {
    try {
      await api(`/progress/${id}/bookmarks`, {
        method: "POST",
        body: JSON.stringify({
          page,
          label: `Page ${page}`,
        }),
      });

      window.alert(`Page ${page} bookmarked.`);
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function restartBook() {
    try {
      await api(`/progress/${id}`, {
        method: "DELETE",
      });

      setPage(1);
      window.alert("Reading progress reset.");
    } catch (error) {
      window.alert(error.message);
    }
  }

  if (!book) {
    return (
      <Layout>
        <div className="loading">
          {pdfError ? pdfError : "Opening book…"}
        </div>
      </Layout>
    );
  }

  const directPdfUrl = resolvePdfUrl(book.pdfPath);

  return (
    <Layout>
      <main className="reader">
        <aside className="readerSide">
          <Link to="/library">
            <ArrowLeft />
            Library
          </Link>

          <img
            src={resolveAssetUrl(book.coverPath)}
            alt={`${book.title} cover`}
          />

          <h3>{book.title}</h3>
          <p>
            Class {book.classLevel} • {book.subject}
          </p>

          <button type="button" onClick={bookmarkPage}>
            <Bookmark />
            Bookmark page
          </button>

          <button type="button" onClick={restartBook}>
            <RotateCcw />
            Start from beginning
          </button>

          <button type="button" onClick={makeQuiz} disabled={busy}>
            <ClipboardCheck />
            Create quiz
          </button>
        </aside>

        <section className="readerMain">
          <div className="readerTools">
            <form onSubmit={searchPdf}>
              <Search />

              <input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search inside book"
              />

              <button type="submit" disabled={!pdf || busy}>
                {busy ? "Working…" : "Search"}
              </button>
            </form>

            <div>
              <button
                type="button"
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft />
              </button>

              <input
                value={page}
                onChange={(event) => {
                  const value = Number(event.target.value) || 1;
                  setPage(Math.max(1, Math.min(pages, value)));
                }}
              />

              <span>/ {pages}</span>

              <button
                type="button"
                aria-label="Next page"
                disabled={page >= pages}
                onClick={() =>
                  setPage((current) => Math.min(pages, current + 1))
                }
              >
                <ChevronRight />
              </button>
            </div>
          </div>

          <div className="readBar">
            <i style={{ width: `${(page / Math.max(pages, 1)) * 100}%` }} />
          </div>

          <div
            className="pdfStage"
            ref={stage}
            onMouseUp={captureSelection}
          >
            {pdfError && (
              <div className="pdfLoadError">
                <h3>Unable to load PDF</h3>
                <p>{pdfError}</p>

                <a
                  href={directPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PDF directly
                </a>
              </div>
            )}

            {!pdfError && !pdfBlobUrl && (
              <div className="loading">Loading PDF…</div>
            )}

            {pdfBlobUrl && (
              <Document
                key={pdfBlobUrl}
                file={pdfBlobUrl}
                onLoadSuccess={(loadedPdf) => {
                  console.log(
                    "PDF loaded successfully:",
                    loadedPdf.numPages,
                  );

                  setPages(loadedPdf.numPages);
                  setPdf(loadedPdf);

                  if (page > loadedPdf.numPages) {
                    setPage(1);
                  }
                }}
                onLoadError={(error) => {
                  console.error("React-PDF load error:", error);
                  setPdfError(error.message);
                }}
                onSourceError={(error) => {
                  console.error("React-PDF source error:", error);
                  setPdfError(error.message);
                }}
                loading={
                  <div className="loading">Preparing book pages…</div>
                }
                error={
                  <div className="pdfLoadError">
                    Failed to render PDF.
                  </div>
                }
              >
                <Page
                  pageNumber={page}
                  width={Math.min(
                    900,
                    Math.max(320, (stage.current?.clientWidth || 950) - 60),
                  )}
                  renderTextLayer
                  renderAnnotationLayer
                />
              </Document>
            )}
          </div>
        </section>

        {panel && (
          <aside className="drawer">
            <div className="drawerHead">
              <b>
                {panel === "quiz"
                  ? "Quick quiz"
                  : panel === "search"
                    ? "Search results"
                    : "Study companion"}
              </b>

              <button
                type="button"
                onClick={() => {
                  stopSpeech();
                  setPanel(null);
                }}
              >
                <X />
              </button>
            </div>

            {panel === "search" ? (
              <div className="drawerBody">
                <h3>{hits.length} matches</h3>

                {hits.map((hit) => (
                  <button
                    key={`${hit.page}-${hit.snippet}`}
                    type="button"
                    className="hit"
                    onClick={() => {
                      setPage(hit.page);
                      setPanel(null);
                    }}
                  >
                    <b>Page {hit.page}</b>
                    <span>{hit.snippet}</span>
                  </button>
                ))}
              </div>
            ) : panel === "quiz" ? (
              <div className="drawerBody">
                {quiz?.questions?.map((question, questionIndex) => (
                  <div
                    className="question"
                    key={`${question.question}-${questionIndex}`}
                  >
                    <h4>
                      {questionIndex + 1}. {question.question}
                    </h4>

                    {question.options.map((option, optionIndex) => (
                      <label key={`${option}-${optionIndex}`}>
                        <input
                          type="radio"
                          name={`question-${questionIndex}`}
                          checked={answers[questionIndex] === optionIndex}
                          onChange={() => {
                            const next = [...answers];
                            next[questionIndex] = optionIndex;
                            setAnswers(next);
                          }}
                        />
                        {option}
                      </label>
                    ))}

                    {question.userAnswer != null && (
                      <p
                        className={
                          question.userAnswer === question.correctIndex
                            ? "correct"
                            : "wrong"
                        }
                      >
                        {question.explanation}
                      </p>
                    )}
                  </div>
                ))}

                {quiz?.questions && !quiz.questions.some(
                  (question) => question.userAnswer != null,
                ) && (
                  <button
                    className="primary"
                    type="button"
                    onClick={submitQuiz}
                  >
                    Submit quiz
                  </button>
                )}

                {quiz?.questions?.some(
                  (question) => question.userAnswer != null,
                ) && (
                  <h3>
                    Score: {quiz.score}/{quiz.total}
                  </h3>
                )}
              </div>
            ) : (
              <div className="drawerBody">
                <span className="selectedLabel">
                  <Highlighter />
                  Selected text
                </span>

                <blockquote>{selected}</blockquote>

                {!answer && (
                  <div className="actionRow">
                    <button
                      className="primary"
                      type="button"
                      disabled={busy}
                      onClick={explain}
                    >
                      {busy ? "Explaining…" : "Explain in detail"}
                    </button>
                  </div>
                )}

                {answer?.error && (
                  <div className="error">{answer.error}</div>
                )}

                {answer?.explanation && (
                  <>
                    <div className="aiTeacherToolbar">
                      <button
                        type="button"
                        className="teacherTool"
                        onClick={startReadAloud}
                        disabled={speaking && !speechPaused}
                      >
                        {speaking && !speechPaused ? <Volume2 /> : <Play />}
                        {speaking && !speechPaused ? "Reading…" : "Read aloud"}
                      </button>

                      <button
                        type="button"
                        className="teacherTool"
                        onClick={pauseOrResumeSpeech}
                        disabled={!speaking}
                      >
                        {speechPaused ? <Play /> : <Pause />}
                        {speechPaused ? "Resume" : "Pause"}
                      </button>

                      <button
                        type="button"
                        className="teacherTool"
                        onClick={stopSpeech}
                        disabled={!speaking}
                      >
                        <Square />
                        Stop
                      </button>

                      <label className="speechRate">
                        Speed
                        <select value={speechRate} onChange={changeSpeechRate}>
                          <option value="0.75">0.75x</option>
                          <option value="1">1x</option>
                          <option value="1.25">1.25x</option>
                          <option value="1.5">1.5x</option>
                        </select>
                      </label>

                      <button
                        type="button"
                        className="teacherTool"
                        onClick={copyExplanation}
                      >
                        <Copy />
                        Copy
                      </button>
                    </div>

                    <div
                      className="markdown aiTeacherAnswer"
                      dangerouslySetInnerHTML={{
                        __html: marked.parse(answer.explanation),
                      }}
                    />

                    <div className="aiFollowActions">
                      <button
                        type="button"
                        className="diagramButton"
                        disabled={visualBusy}
                        onClick={generateDiagram}
                      >
                        <Image />
                        {visualBusy
                          ? "Creating diagram…"
                          : answer.visual
                            ? "Create new diagram"
                            : "Create diagram"}
                      </button>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={makeQuiz}
                      >
                        <ClipboardCheck />
                        Quiz me on this
                      </button>
                    </div>

                    {answer.visualError && (
                      <div className="error">{answer.visualError}</div>
                    )}

                    {answer.visual && (
                      <div className="generatedDiagram">
                        <div>
                          <b>AI-generated learning diagram</b>
                          <small>
                            Verify important labels with the textbook.
                          </small>
                        </div>
                        <img
                          className="aiImage"
                          src={answer.visual}
                          alt="AI-generated learning diagram"
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </aside>
        )}
      </main>
    </Layout>
  );
}

function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/dashboard")
      .then(setDashboard)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <main className="content">
        <span className="kicker">PERSONAL ANALYTICS</span>
        <h1>My learning</h1>

        {error && <div className="error">{error}</div>}

        <section className="stats">
          <article>
            <Trophy />
            <div>
              <b>{dashboard?.streak || 0}</b>
              <span>Day streak</span>
            </div>
          </article>

          <article>
            <BookMarked />
            <div>
              <b>{dashboard?.progress?.length || 0}</b>
              <span>Books started</span>
            </div>
          </article>

          <article>
            <ClipboardCheck />
            <div>
              <b>{dashboard?.attempts?.length || 0}</b>
              <span>Quiz attempts</span>
            </div>
          </article>
        </section>

        <section className="progressList">
          {dashboard?.progress?.map((progress) => (
            <article key={progress._id}>
              <img
                src={resolveAssetUrl(progress.book.coverPath)}
                alt={`${progress.book.title} cover`}
              />

              <div>
                <small>{progress.book.subject}</small>
                <h3>{progress.book.title}</h3>

                <div className="bar">
                  <i style={{ width: `${progress.percent}%` }} />
                </div>

                <p>
                  {progress.percent}% • Page {progress.currentPage} •{" "}
                  {progress.notes.length} notes •{" "}
                  {progress.bookmarks.length} bookmarks
                </p>
              </div>
            </article>
          ))}
        </section>
      </main>
    </Layout>
  );
}

function Parent() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/parent/student")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <main className="content">
        <span className="kicker">PARENT DASHBOARD</span>
        <h1>Student progress</h1>

        {error && <div className="error">{error}</div>}

        {!data?.student ? (
          <div className="empty">
            No student linked to this demo parent yet.
          </div>
        ) : (
          <pre>{JSON.stringify(data, null, 2)}</pre>
        )}
      </main>
    </Layout>
  );
}

function Admin() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/admin/summary")
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Layout>
      <main className="content">
        <span className="kicker">ADMIN CONSOLE</span>
        <h1>Platform summary</h1>

        {error && <div className="error">{error}</div>}

        <section className="stats">
          <article>
            <Users />
            <div>
              <b>{summary?.users || 0}</b>
              <span>Users</span>
            </div>
          </article>

          <article>
            <BookOpen />
            <div>
              <b>{summary?.books || 0}</b>
              <span>Books</span>
            </div>
          </article>

          <article>
            <BarChart3 />
            <div>
              <b>{summary?.reads || 0}</b>
              <span>Reading records</span>
            </div>
          </article>
        </section>
      </main>
    </Layout>
  );
}

function Guard({ children, role }) {
  const currentSession = getSession();

  if (!currentSession) {
    return <Navigate to="/login" replace />;
  }

  if (role && currentSession.user.role !== role) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Auth />} />

      <Route
        path="/"
        element={
          <Guard>
            <HomePage />
          </Guard>
        }
      />

      <Route
        path="/library"
        element={
          <Guard>
            <LibraryPage />
          </Guard>
        }
      />

      <Route
        path="/reader/:id"
        element={
          <Guard>
            <ReaderPage />
          </Guard>
        }
      />

      <Route
        path="/dashboard"
        element={
          <Guard>
            <Dashboard />
          </Guard>
        }
      />

      <Route
        path="/parent"
        element={
          <Guard role="parent">
            <Parent />
          </Guard>
        }
      />

      <Route
        path="/admin"
        element={
          <Guard role="admin">
            <Admin />
          </Guard>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);