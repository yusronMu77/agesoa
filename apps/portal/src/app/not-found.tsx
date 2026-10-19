import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p>The page or log entry you asked for does not exist.</p>
      <p>
        <Link href="/log">Go to the decision log</Link> or <Link href="/">the home page</Link>.
      </p>
    </>
  );
}
