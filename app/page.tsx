import { WaitlistForm } from "./WaitlistForm";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const steps = [
  {
    n: "01",
    title: "Join",
    body: "Become a member. Membership is your pass to every limited release, and members always get first look.",
  },
  {
    n: "02",
    title: "Reserve before it ships",
    body: "Claim your share of a drop while it's still at the distributor. Every can on the truck is spoken for before it lands.",
  },
  {
    n: "03",
    title: "Collect it cold",
    body: "Pick up at our Oʻahu shop during your window, or get local delivery with an ID check at the door.",
  },
];

const founding = [
  "A guaranteed share of every standard drop you reserve in your Founding window",
  "First in the draw for limited releases",
  "First access and higher per-member limits on every drop",
  "Only 100 spots, offered to the waitlist first",
];

const faqs = [
  {
    q: "When do you open?",
    a: "We start selling only after our Hawaiʻi retail liquor license is issued. The waitlist is how you'll hear first, and how Founding spots are offered.",
  },
  {
    q: "Do I pay anything now?",
    a: "No. Joining the waitlist is free, and nothing is sold or reserved through this site yet.",
  },
  {
    q: "Where can I get my beer?",
    a: "Scheduled pickup at our Oʻahu shop to start, with local Oʻahu delivery soon after. We'll add neighbor islands if the law and logistics allow.",
  },
  {
    q: "Who can join?",
    a: "Hawaiʻi residents who are 21 or older. We verify ID when you become a member, and again when you collect your beer.",
  },
  {
    q: "What if a drop sells out?",
    a: "Limited releases use a fair draw, not a click race: enter any time during the window and the draw picks who gets it after it closes. If you're not picked, or a standard drop runs out, you go on that drop's waitlist, and when someone cancels or a shipment comes in bigger than planned, the next person in line gets it automatically.",
  },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const { ref } = await searchParams;
  const referredBy = typeof ref === "string" && /^[a-f0-9]{8}$/i.test(ref) ? ref.toLowerCase() : null;

  return (
    <>
      <header className="header">
        <div className="wrap header-inner">
          <span className="wordmark">The Chill Bottle Shop</span>
          <a href="#join" className="header-link">Join the waitlist</a>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <p className="eyebrow eyebrow-light">Opening soon · Oʻahu</p>
              <h1>Rare beer, reserved before it lands.</h1>
              <p className="lede">
                A members-first bottle shop for Hawaiʻi. Every limited drop is spoken for before the
                truck arrives, so it&apos;s yours before it&apos;s even here.
              </p>
              <a href="#join" className="button button-light">Get on the list</a>
            </div>

            <div className="ticket" aria-label="Example of a member's drop allocation">
              <div className="ticket-top">
                <span>Drop 001</span>
                <span className="pill">Allocated</span>
              </div>
              <p className="ticket-title">Your allocation</p>
              <dl className="ticket-rows">
                <div><dt>Reserved</dt><dd>2 × 4-pack</dd></div>
                <div><dt>Status</dt><dd>In transit to shop</dd></div>
                <div><dt>Pickup</dt><dd>Your window, Oʻahu</dd></div>
                <div><dt>Charged</dt><dd>When it arrives</dd></div>
              </dl>
              <p className="ticket-foot">Example only</p>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <p className="eyebrow">How it works</p>
            <h2>No lines. No bots. No refresh button.</h2>
            <ol className="steps">
              {steps.map((s) => (
                <li key={s.n} className="step">
                  <span className="step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section section-tint">
          <div className="wrap founding">
            <div>
              <p className="eyebrow">Founding Members</p>
              <h2>100 spots. Waitlist first.</h2>
              <p>
                Founding Members help us open the doors and get the best seat at every drop. Check
                the box when you join and we&apos;ll offer you a spot before anyone else.
              </p>
            </div>
            <ul className="perks">
              {founding.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </div>
        </section>

        <section className="section" id="join">
          <div className="wrap join">
            <div className="join-copy">
              <p className="eyebrow">The waitlist</p>
              <h2>Save your spot.</h2>
              <p>
                Tell us where you are and we&apos;ll let you know when memberships open. Bring
                friends with your invite link to move toward the front for Founding spots.
              </p>
            </div>
            <div className="card">
              <WaitlistForm referredBy={referredBy} siteUrl={siteUrl} />
            </div>
          </div>
        </section>

        <section className="section section-tint">
          <div className="wrap faq">
            <p className="eyebrow">Questions</p>
            <h2>Good to know</h2>
            <div className="faq-list">
              {faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <span className="wordmark">The Chill Bottle Shop</span>
          <p>
            Must be 21 or older. No alcohol is sold through this site at this time; sales begin only
            once our Hawaiʻi retail liquor license is issued. Please enjoy responsibly.
          </p>
          <p><a href="/privacy">Privacy</a></p>
        </div>
      </footer>
    </>
  );
}
