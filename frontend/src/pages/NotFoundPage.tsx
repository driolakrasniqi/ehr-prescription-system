import { ArrowLeft, FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";
export function NotFoundPage() {
  return (
    <section
      style={{ minHeight: "55vh", display: "grid", placeItems: "center", textAlign: "center" }}
    >
      <div>
        <FileQuestion size={42} color="var(--teal)" />
        <h2 className="display-font" style={{ fontSize: 32, marginBottom: 8 }}>
          This workspace is not available.
        </h2>
        <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>
          The page may belong to a module that has not been connected yet.
        </p>
        <Link to="/" className="primary-action">
          <ArrowLeft size={16} /> Return to overview
        </Link>
      </div>
    </section>
  );
}
