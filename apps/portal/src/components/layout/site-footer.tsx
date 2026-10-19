export function SiteFooter({ release, appEnv }: { release: string; appEnv: string }) {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        AGESOA portal · release <span className="mono">{release}</span> · environment <span className="mono">{appEnv}</span>
      </div>
    </footer>
  );
}
