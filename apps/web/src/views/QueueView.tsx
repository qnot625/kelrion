import { ArrowRight, Clock3, Pause, Play, TicketCheck, Users, ListOrdered } from "lucide-react";
import { useState } from "react";
import type { KlerionSession } from "../lib/session";
import { WaitlistConsole } from "../features/waitlists/WaitlistConsole";

const initial = [
  { ticket: "A-104", name: "Adewale K.", service: "Account opening", wait: "18m", priority: true },
  { ticket: "A-105", name: "Nkechi O.", service: "Document verification", wait: "14m", priority: false },
  { ticket: "A-106", name: "Musa B.", service: "Loan inquiry", wait: "9m", priority: false }
];

interface QueueViewProps {
  readonly session: KlerionSession;
}

export function QueueView({ session }: QueueViewProps) {
  const [activeTab, setActiveTab] = useState<"live-queue" | "priority-waitlist">("priority-waitlist");
  const [queue, setQueue] = useState(initial);
  const [paused, setPaused] = useState(false);

  function callNext() {
    setQueue((current) => current.slice(1));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Switcher */}
      <div className="flex border-b border-gray-200 bg-white px-6 py-2 rounded-xl shadow-xs">
        <button
          id="tab-priority-waitlist"
          onClick={() => setActiveTab("priority-waitlist")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "priority-waitlist"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          <ListOrdered size={16} />
          Priority Waitlist (FIFO)
        </button>
        <button
          id="tab-live-queue"
          onClick={() => setActiveTab("live-queue")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === "live-queue"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          }`}
        >
          <TicketCheck size={16} />
          Live Walk-in Queue
        </button>
      </div>

      {activeTab === "priority-waitlist" ? (
        <WaitlistConsole session={session} />
      ) : (
        <section className="view">
          <header className="view-heading">
            <div>
              <span className="eyebrow live">
                <i />
                Live branch operations
              </span>
              <h1>Queue command centre</h1>
              <p>Coordinate waiting customers, service counters, and branch capacity.</p>
            </div>
            <button
              className={paused ? "primary" : "secondary"}
              onClick={() => setPaused(!paused)}
            >
              {paused ? (
                <>
                  <Play size={16} />
                  Resume queue
                </>
              ) : (
                <>
                  <Pause size={16} />
                  Pause queue
                </>
              )}
            </button>
          </header>

          <div className="queue-metrics">
            <article>
              <Users />
              <span>
                Waiting<strong>{queue.length + 21}</strong>
              </span>
            </article>
            <article>
              <TicketCheck />
              <span>
                Being served<strong>8</strong>
              </span>
            </article>
            <article>
              <Clock3 />
              <span>
                Average wait<strong>11m</strong>
              </span>
            </article>
            <article>
              <span className="capacity-ring">82%</span>
              <span>
                Capacity<strong>High</strong>
              </span>
            </article>
          </div>

          <div className="queue-grid">
            <article className="panel queue-list">
              <header>
                <div>
                  <h2>Next customers</h2>
                  <p>Victoria Island · Account services</p>
                </div>
                <button
                  className="primary"
                  onClick={callNext}
                  disabled={!queue.length}
                >
                  Call next <ArrowRight size={16} />
                </button>
              </header>
              {queue.map((item) => (
                <div className="queue-row" key={item.ticket}>
                  <span className="ticket">{item.ticket}</span>
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.service}</small>
                  </div>
                  {item.priority && <em>Priority</em>}
                  <time>{item.wait}</time>
                  <button>Call</button>
                </div>
              ))}
            </article>

            <aside className="panel counter-panel">
              <header>
                <h2>Service counters</h2>
                <p>6 of 8 currently active</p>
              </header>
              {[
                ["Counter 01", "Serving A-098", "active"],
                ["Counter 02", "Available", "ready"],
                ["Counter 03", "Serving A-102", "active"],
                ["Counter 04", "Paused", "paused"]
              ].map(([name, status, tone]) => (
                <div className="counter-row" key={name}>
                  <i className={tone} />
                  <div>
                    <strong>{name}</strong>
                    <small>{status}</small>
                  </div>
                  <button>Manage</button>
                </div>
              ))}
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}
