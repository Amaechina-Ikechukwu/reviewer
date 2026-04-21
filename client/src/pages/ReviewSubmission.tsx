import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TeacherShell from "../components/TeacherShell";
import { toast } from "../components/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Icon } from "../components/ui/Icons";
import { Input, Label, Textarea } from "../components/ui/Input";
import { api } from "../api";
import { cn } from "../lib/cn";
import { formatDateTime } from "../lib/format";
import type { CodeFile, Review } from "../types";

type SubmissionResponse = {
  submission: {
    id: string;
    submittedAt: string;
    submissionType: "github" | "file_upload";
    githubUrl: string | null;
    isLate: boolean;
  };
  assignment: {
    id: string;
    title: string;
    description: string;
    rubric: string;
    maxScore: number;
    sourceType: string;
    sourceMarkdown: string | null;
    sourceUrl: string | null;
    defaultProvider: string;
  };
  studentName: string | null;
  studentEmail: string | null;
};

function structureLabel(classification?: string) {
  switch (classification) {
    case "one_file_per_question":
      return "File per question";
    case "multi_file_per_question":
      return "Grouped by question";
    case "single_project_solution":
      return "Single combined solution";
    case "mixed_or_unclear":
      return "Mixed";
    default:
      return "Structure pending";
  }
}

function buildReactPreviewDocument(files: CodeFile[]): string | null {
  const hasReact = files.some((f) => /\.(jsx|tsx)$/i.test(f.filename));
  if (!hasReact) return null;

  // Partition files into text sources and binary images
  const textFiles: Record<string, string> = {};
  const imageFiles: Record<string, string> = {};
  for (const file of files) {
    if (file.language === "image") imageFiles[file.filename] = file.content;
    else textFiles[file.filename] = file.content;
  }

  // Find an entry file: prefer src/main, src/index, then App
  const entryCandidates = [
    "src/main.jsx", "src/main.tsx", "src/index.jsx", "src/index.tsx",
    "main.jsx", "main.tsx", "index.jsx", "index.tsx",
    "src/App.jsx", "src/App.tsx", "App.jsx", "App.tsx",
  ];
  const allKeys = Object.keys(textFiles);
  let entry = entryCandidates.find((c) => textFiles[c]) ||
    allKeys.find((k) => /\/(main|index)\.(jsx|tsx)$/i.test(k)) ||
    allKeys.find((k) => /\.(jsx|tsx)$/i.test(k));
  if (!entry) return null;

  // Loader runs inside the iframe — written as a plain string, no interpolation inside.
  const loaderScript = `
(async () => {
  const root = document.getElementById('root');
  const errBox = document.getElementById('__err');
  const showErr = (msg) => {
    errBox.textContent = msg;
    errBox.style.display = 'block';
    if (root) root.innerHTML = '';
    console.error(msg);
  };

  try {
    const FILES = window.__FILES__;
    const IMAGES = window.__IMAGES__;
    const ENTRY = window.__ENTRY__;

    const TEXT_EXT = ['.jsx', '.tsx', '.js', '.ts', '.mjs', '.cjs'];

    function normalize(p) {
      const parts = p.split('/');
      const out = [];
      for (const part of parts) {
        if (part === '..') out.pop();
        else if (part !== '.' && part !== '') out.push(part);
      }
      return out.join('/');
    }

    function resolveRel(base, rel) {
      const lastSlash = base.lastIndexOf('/');
      const baseDir = lastSlash >= 0 ? base.substring(0, lastSlash) : '';
      return normalize((baseDir ? baseDir + '/' : '') + rel);
    }

    function findFile(path) {
      if (FILES[path]) return path;
      if (IMAGES[path]) return path;
      for (const ext of TEXT_EXT) {
        if (FILES[path + ext]) return path + ext;
      }
      for (const ext of TEXT_EXT) {
        if (FILES[path + '/index' + ext]) return path + '/index' + ext;
      }
      return null;
    }

    const blobCache = {};
    const cssInjected = new Set();

    async function loadModule(path) {
      if (blobCache[path]) return blobCache[path];

      const found = findFile(path);
      if (!found) throw new Error('Cannot resolve module: ' + path);

      if (IMAGES[found]) {
        const js = 'export default ' + JSON.stringify(IMAGES[found]) + ';';
        const blob = new Blob([js], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        blobCache[path] = url;
        return url;
      }

      let code = FILES[found];

      // Side-effect CSS imports → inject <style>
      code = code.replace(/import\\s+['"]([^'"]+\\.css)['"]\\s*;?/g, (_, p) => {
        const resolved = resolveRel(found, p);
        if (!cssInjected.has(resolved)) {
          cssInjected.add(resolved);
          const css = FILES[resolved];
          if (css) {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
          }
        }
        return '';
      });

      // Rewrite bare package imports (except react*) to esm.sh — do this BEFORE blob substitution
      code = code.replace(/(\\bfrom\\s+|\\bimport\\s*\\(\\s*)(["\\'])(@?[a-zA-Z][\\w\\-.]*(?:\\/[\\w\\-.@]+)*)\\2/g, (m, prefix, q, spec) => {
        if (spec === 'react' || spec === 'react-dom' || spec.startsWith('react/') || spec.startsWith('react-dom/')) return m;
        return prefix + q + 'https://esm.sh/' + spec + q;
      });

      // Collect relative specifiers
      const specs = new Set();
      code.replace(/\\bfrom\\s+['"](\\.[^'"]+)['"]/g, (_, s) => { specs.add(s); return ''; });
      code.replace(/\\bimport\\s*\\(\\s*['"](\\.[^'"]+)['"]\\s*\\)/g, (_, s) => { specs.add(s); return ''; });

      // Resolve each relative import to a blob URL
      for (const spec of specs) {
        const resolvedPath = resolveRel(found, spec);
        const blobUrl = await loadModule(resolvedPath);
        const escaped = spec.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
        code = code.replace(new RegExp('(\\\\bfrom\\\\s+|\\\\bimport\\\\s*\\\\(\\\\s*)(["\\'])' + escaped + '\\\\2', 'g'), (_, prefix, q) => prefix + q + blobUrl + q);
      }

      // Transform JSX / TS with Babel
      const presets = [['react', { runtime: 'automatic' }]];
      if (/\\.tsx?$/i.test(found)) {
        presets.push(['typescript', { isTSX: true, allExtensions: true }]);
      }
      let transformed;
      try {
        transformed = Babel.transform(code, { presets, filename: found, sourceType: 'module' }).code;
      } catch (e) {
        throw new Error('Babel failed in ' + found + ': ' + e.message);
      }

      const blob = new Blob([transformed], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      blobCache[path] = url;
      return url;
    }

    const url = await loadModule(ENTRY);
    const entryCode = FILES[ENTRY] || '';
    const hasRenderCall = /createRoot\\s*\\(|ReactDOM\\.render\\s*\\(/.test(entryCode);

    if (hasRenderCall) {
      await import(url);
    } else {
      const mod = await import(url);
      const Component = mod.default;
      if (!Component) throw new Error('Entry ' + ENTRY + ' has no default export to render.');
      const React = await import('react');
      const ReactDOMClient = await import('react-dom/client');
      ReactDOMClient.createRoot(root).render(React.createElement(Component));
    }
  } catch (err) {
    showErr('Preview error: ' + (err && err.message ? err.message : String(err)) + (err && err.stack ? '\\n\\n' + err.stack : ''));
  }
})();
`;

  const filesJson = JSON.stringify(textFiles).replace(/</g, "\\u003c");
  const imagesJson = JSON.stringify(imageFiles).replace(/</g, "\\u003c");
  const entryJson = JSON.stringify(entry);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react-dom": "https://esm.sh/react-dom@18.3.1",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
    "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
    "react/jsx-dev-runtime": "https://esm.sh/react@18.3.1/jsx-dev-runtime"
  }
}
</script>
<script src="https://unpkg.com/@babel/standalone@7.26.2/babel.min.js"></script>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #fff; }
#root { min-height: 100vh; }
#__err { display: none; color: #b42318; background: #fef3f2; border: 1px solid #fda29b; padding: 16px; margin: 16px; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 12px; white-space: pre-wrap; }
</style>
</head>
<body>
<div id="root"></div>
<pre id="__err"></pre>
<script>
window.__FILES__ = ${filesJson};
window.__IMAGES__ = ${imagesJson};
window.__ENTRY__ = ${entryJson};
</script>
<script>${loaderScript}</script>
</body>
</html>`;
}

function buildPreviewDocument(files: CodeFile[], htmlFile: CodeFile) {
  const dir = htmlFile.filename.includes("/")
    ? htmlFile.filename.slice(0, htmlFile.filename.lastIndexOf("/") + 1)
    : "";

  let html = htmlFile.content;
  const css = files
    .filter((f) => f.filename.toLowerCase().endsWith(".css") && f.filename.startsWith(dir))
    .map((f) => `<style>${f.content}</style>`)
    .join("\n");
  const js = files
    .filter((f) => f.filename.toLowerCase().endsWith(".js") && f.filename.startsWith(dir))
    .map((f) => `<script>${f.content}<\/script>`)
    .join("\n");

  html = html.includes("</head>") ? html.replace("</head>", `${css}</head>`) : `${css}${html}`;
  html = html.includes("</body>") ? html.replace("</body>", `${js}</body>`) : `${html}${js}`;
  return html;
}

function ScorePill({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? score / max : 0;
  const tone = pct >= 0.8 ? "success" : pct >= 0.6 ? "warn" : "danger";
  const classes =
    tone === "success"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : tone === "warn"
        ? "bg-[var(--warn-soft)] text-[var(--warn)]"
        : "bg-[var(--danger-soft)] text-[var(--danger)]";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", classes)}>
      {score}
      <span className="opacity-60">/{max}</span>
    </span>
  );
}

export default function ReviewSubmission() {
  const { submissionId } = useParams();
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [overrideScore, setOverrideScore] = useState("");
  const [finalFeedback, setFinalFeedback] = useState("");
  const [message, setMessage] = useState("");
  const [releaseCount, setReleaseCount] = useState(0);

  useEffect(() => {
    if (!submissionId) return;

    api<SubmissionResponse>(`/submissions/${submissionId}`)
      .then(setSubmission)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load submission"));

    api<{ files: CodeFile[] }>(`/submissions/${submissionId}/files`)
      .then((data) => setFiles(data.files))
      .catch(() => setFiles([]));

    api<Review>(`/reviews/${submissionId}`)
      .then((data) => {
        setReview(data);
        const score = data.teacherOverrideScore ?? data.aiScore;
        setOverrideScore(typeof score === "number" ? String(score) : "");
        setFinalFeedback(data.feedback?.summary || "");
      })
      .catch(() => setReview(null));
  }, [submissionId]);

  useEffect(() => {
    if (selectedFileIndex >= files.length) setSelectedFileIndex(0);
  }, [files, selectedFileIndex]);

  const selectedFile = files[selectedFileIndex] || files[0];
  const isHtmlFile = (f?: CodeFile) => !!f && f.filename.toLowerCase().endsWith(".html");
  const isImageFile = (f?: CodeFile) => f?.language === "image";
  const isSvgFile = (f?: CodeFile) => !!f && f.filename.toLowerCase().endsWith(".svg");

  const reactPreviewDoc = useMemo(() => {
    const hasReact = files.some((f) => /\.(jsx|tsx)$/i.test(f.filename));
    return hasReact ? buildReactPreviewDocument(files) : null;
  }, [files]);

  const previewDoc = useMemo(() => {
    if (selectedFile && isHtmlFile(selectedFile)) return buildPreviewDocument(files, selectedFile);
    return reactPreviewDoc;
  }, [files, selectedFile, reactPreviewDoc]);

  const previewLabel = useMemo(() => {
    if (selectedFile && isHtmlFile(selectedFile)) return "HTML Preview";
    if (reactPreviewDoc) return "React Preview";
    return "Preview";
  }, [selectedFile, reactPreviewDoc]);

  const maxScore = review?.maxScore || submission?.assignment.maxScore || 100;
  const geminiSummary = review?.feedback?.summary || "No Gemini review has been run for this submission yet.";
  const geminiSuggestions = review?.feedback?.suggestions || [];
  const geminiModel = review?.feedback?.model || "gemini-2.5-flash";
  const geminiScore = review?.teacherOverrideScore ?? review?.aiScore;
  const structure = review?.feedback?.submissionStructure;
  const fileScores = review?.feedback?.fileScores || [];
  const averageFileScore = review?.feedback?.averageFileScore;
  const questionGroups = review?.feedback?.questionGroups || [];
  const selectedFileLineCount =
    selectedFile && !isImageFile(selectedFile) && !isSvgFile(selectedFile)
      ? selectedFile.content.split("\n").length
      : 0;
  const selectedFileScore = selectedFile
    ? fileScores.find((entry) => entry.filename === selectedFile.filename)
    : undefined;

  function focusFile(filename: string) {
    const nextIndex = files.findIndex((file) => file.filename === filename);
    if (nextIndex >= 0) setSelectedFileIndex(nextIndex);
  }

  async function runReview() {
    if (!submissionId) return;
    setReviewing(true);
    setMessage("");

    try {
      const nextReview = await api<Review>(`/reviews/${submissionId}/run`, {
        method: "POST",
        body: JSON.stringify({ provider: "gemini" }),
      });
      setReview(nextReview);
      const score = nextReview.teacherOverrideScore ?? nextReview.aiScore;
      setOverrideScore(typeof score === "number" ? String(score) : "");
      setFinalFeedback(nextReview.feedback?.summary || "");
      toast().success("Review completed");
      api<{ files: CodeFile[] }>(`/submissions/${submissionId}/files`)
        .then((data) => setFiles(data.files))
        .catch(() => {});
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Review failed");
    } finally {
      setReviewing(false);
    }
  }

  async function applyOverride() {
    if (!submissionId) return;
    setReleasing(true);
    try {
      const nextReview = await api<Review>(`/reviews/${submissionId}/override`, {
        method: "PATCH",
        body: JSON.stringify({ score: Number(overrideScore), feedback: finalFeedback }),
      });
      setReview(nextReview);
      setReleaseCount((c) => c + 1);
      toast().success("Grade released");
    } catch (err) {
      toast().error(err instanceof Error ? err.message : "Failed to release grade");
    } finally {
      setReleasing(false);
    }
  }

  if (!submission) {
    return (
      <TeacherShell section="submissions">
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--fg-muted)]">
          Loading submission...
        </div>
      </TeacherShell>
    );
  }

  const canRelease = review && review.status === "completed";
  const firstName = submission.studentName?.split(" ")[0] || "Student";

  return (
    <TeacherShell section="submissions">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <Link
            to="/teacher/submissions"
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--accent)]"
          >
            <Icon.ChevronLeft className="h-3 w-3" />
            Submissions
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{submission.assignment.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--fg-muted)]">
                <span className="font-medium text-[var(--fg)]">{submission.studentName || "Student"}</span>
                <span>·</span>
                <span>{formatDateTime(submission.submission.submittedAt)}</span>
              </div>
            </div>
            {submission.submission.githubUrl && (
              <a href={submission.submission.githubUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">
                  <Icon.Github className="h-3.5 w-3.5" />
                  GitHub repo
                  <Icon.External className="h-3 w-3" />
                </Button>
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              {submission.submission.submissionType === "github" ? (
                <span className="inline-flex items-center gap-1">
                  <Icon.Github className="h-3 w-3" /> GitHub
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Icon.Upload className="h-3 w-3" /> ZIP
                </span>
              )}
            </Badge>
            {submission.submission.isLate ? (
              <Badge tone="warn">Late</Badge>
            ) : (
              <Badge tone="success">On time</Badge>
            )}
            <Badge tone="accent">{structureLabel(structure?.classification)}</Badge>
          </div>
        </div>

        {message && (
          <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
            {message}
          </div>
        )}

        {/* Code + preview */}
        <Card className="overflow-hidden">
          {files.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface-muted)]/50 px-2 py-1.5">
              {files.map((file, index) => (
                <button
                  key={file.filename}
                  onClick={() => setSelectedFileIndex(index)}
                  type="button"
                  className={cn(
                    "whitespace-nowrap rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors",
                    index === selectedFileIndex
                      ? "bg-[var(--surface)] text-[var(--fg)] shadow-sm ring-1 ring-[var(--border)]"
                      : "text-[var(--fg-muted)] hover:bg-[var(--surface)]/60 hover:text-[var(--fg)]",
                  )}
                >
                  {file.filename}
                </button>
              ))}
            </div>
          )}

          <div className={cn("grid", previewDoc !== null ? "lg:grid-cols-2" : "grid-cols-1")}>
            <div className="flex min-w-0 flex-col border-r border-[var(--border)]">
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-muted)]/30 px-4 py-2 text-[11px] text-[var(--fg-muted)]">
                <span className="truncate font-mono">{selectedFile?.filename || "—"}</span>
                <span>
                  {selectedFile && isImageFile(selectedFile)
                    ? "image"
                    : selectedFile && isSvgFile(selectedFile)
                      ? "svg"
                      : selectedFile
                        ? `${selectedFileLineCount} lines`
                        : ""}
                </span>
              </div>
              {selectedFile && isImageFile(selectedFile) ? (
                <div className="flex max-h-[520px] items-center justify-center overflow-auto bg-[var(--surface)] p-4">
                  <img
                    src={selectedFile.content}
                    alt={selectedFile.filename}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : selectedFile && isSvgFile(selectedFile) ? (
                <div className="flex max-h-[520px] items-center justify-center overflow-auto bg-[var(--surface)] p-4">
                  <img
                    src={`data:image/svg+xml,${encodeURIComponent(selectedFile.content)}`}
                    alt={selectedFile.filename}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : selectedFile ? (
                <pre className="m-0 max-h-[520px] overflow-auto bg-[var(--surface)] p-4 font-mono text-xs leading-relaxed text-[var(--fg)]">
                  {selectedFile.content}
                </pre>
              ) : (
                <div className="flex h-40 items-center justify-center text-sm text-[var(--fg-muted)]">
                  No files yet. Run Gemini review to clone the repo.
                </div>
              )}
            </div>

            {previewDoc !== null && (
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-muted)]/30 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--danger)]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--warn)]/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]/70" />
                  <div className="ml-2 flex flex-1 items-center gap-1.5 truncate rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--fg-muted)]">
                    <Icon.Link className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {previewLabel} — {submission.studentName || "Student"}
                    </span>
                  </div>
                </div>
                <iframe
                  className="h-[520px] w-full border-0 bg-white"
                  sandbox="allow-scripts"
                  srcDoc={previewDoc}
                  title="Student preview"
                />
              </div>
            )}
          </div>

          {selectedFileScore && (
            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-muted)]/30 px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-semibold">{selectedFileScore.filename}</div>
                <div className="truncate text-[11px] text-[var(--fg-muted)]">{selectedFileScore.summary}</div>
              </div>
              <ScorePill score={selectedFileScore.score} max={selectedFileScore.maxScore} />
            </div>
          )}
        </Card>

        {/* Review analysis + assessment grid */}
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-6">
            {/* AI review */}
            <Card>
              <CardHeader>
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle>
                    <span className="inline-flex items-center gap-2">
                      <Icon.Sparkles className="h-4 w-4 text-[var(--accent)]" />
                      AI review
                    </span>
                  </CardTitle>
                  <span className="font-mono text-[11px] text-[var(--fg-muted)]">{geminiModel}</span>
                </div>
                {typeof geminiScore === "number" && <ScorePill score={geminiScore} max={maxScore} />}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-sm leading-relaxed text-[var(--fg)]">{geminiSummary}</p>

                {typeof averageFileScore === "number" && (
                  <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 px-3 py-2">
                    <span className="text-xs font-medium">Average file score</span>
                    <ScorePill score={Math.round(averageFileScore)} max={maxScore} />
                  </div>
                )}

                {structure && (
                  <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">File-to-question structure</span>
                      <Badge tone="accent">{structure.confidence} confidence</Badge>
                    </div>
                    <div className="text-xs leading-relaxed text-[var(--fg-muted)]">{structure.explanation}</div>
                  </div>
                )}

                {geminiSuggestions.length > 0 && (
                  <ul className="flex flex-col gap-1.5 pl-5 text-sm leading-relaxed text-[var(--fg)]">
                    {geminiSuggestions.map((item) => (
                      <li key={item} className="list-disc">
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Question mapping */}
            <Card>
              <CardHeader>
                <CardTitle>Question mapping</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {questionGroups.length > 0 ? (
                  questionGroups.map((group) => (
                    <div
                      key={`${group.label}-${group.files.join(",")}`}
                      className="flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)]/40 p-3"
                    >
                      <strong className="text-sm">{group.label}</strong>
                      <div className="flex flex-wrap gap-1.5">
                        {group.files.map((file) => (
                          <button
                            key={file}
                            type="button"
                            onClick={() => focusFile(file)}
                            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 font-mono text-[11px] text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                          >
                            <Icon.FileCode className="h-3 w-3" />
                            {file}
                          </button>
                        ))}
                      </div>
                      <div className="text-xs leading-relaxed text-[var(--fg-muted)]">{group.reasoning}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-[var(--fg-muted)]">
                    Run AI review to infer how files map to assignment questions.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* File scores */}
            {fileScores.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>File scores</CardTitle>
                  {typeof averageFileScore === "number" && (
                    <Badge tone="accent">Avg {Math.round(averageFileScore)}/{maxScore}</Badge>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5">
                  {fileScores.map((entry) => (
                    <button
                      key={entry.filename}
                      type="button"
                      onClick={() => focusFile(entry.filename)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        selectedFile?.filename === entry.filename
                          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]/60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs font-semibold text-[var(--fg)]">{entry.filename}</div>
                        <div className="mt-0.5 truncate text-[11px] text-[var(--fg-muted)]">{entry.summary}</div>
                      </div>
                      <ScorePill score={entry.score} max={entry.maxScore} />
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Assessment panel */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Final assessment</CardTitle>
                {typeof geminiScore === "number" && geminiScore > 0 && (
                  <ScorePill score={geminiScore} max={maxScore} />
                )}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Label>
                  Score (0–{maxScore})
                  <div className="flex items-stretch overflow-hidden rounded-lg border border-[var(--border)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20">
                    <Input
                      placeholder="—"
                      value={overrideScore}
                      onChange={(event) => setOverrideScore(event.target.value)}
                      className="border-0 bg-transparent focus:ring-0"
                    />
                    <span className="flex items-center border-l border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 text-xs font-medium text-[var(--fg-muted)]">
                      / {maxScore}
                    </span>
                  </div>
                </Label>

                <Label>
                  Feedback to {firstName}
                  <Textarea
                    placeholder={`Write feedback for ${firstName}...`}
                    value={finalFeedback}
                    onChange={(event) => setFinalFeedback(event.target.value)}
                    rows={6}
                  />
                </Label>

                <div className="flex items-center gap-2">
                  <Button
                    className="flex-1"
                    onClick={applyOverride}
                    disabled={!canRelease}
                    loading={releasing}
                    title={!canRelease ? "Run AI review first" : undefined}
                  >
                    <Icon.Check className="h-3.5 w-3.5" />
                    Release grade
                  </Button>
                  {releaseCount > 0 && <Badge tone="accent">×{releaseCount}</Badge>}
                </div>
                {!canRelease && (
                  <p className="text-center text-[11px] text-[var(--fg-muted)]">
                    Run AI review first to enable grading.
                  </p>
                )}

                <div className="border-t border-[var(--border)] pt-4">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={runReview}
                    loading={reviewing}
                  >
                    <Icon.Sparkles className="h-3.5 w-3.5" />
                    {reviewing ? "Running AI review..." : "Run AI review"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </TeacherShell>
  );
}
