import { render, screen } from "@testing-library/react";

import type { Provenance } from "@/lib/api/schemas";

import { ProvenanceNotice } from "./ProvenanceNotice";

const prov = (p: Partial<Provenance>): Provenance =>
  ({ sources: ["lfd"], quantum: true, quantum_bytes: 64, mixed_with: "os_csprng", ...p });

describe("ProvenanceNotice", () => {
  it("is silent when every reported source contributed", () => {
    const { container } = render(<ProvenanceNotice provenance={prov({ failures: {} })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says the OS CSPRNG fallback is not quantum and names the unavailable source", () => {
    render(<ProvenanceNotice provenance={prov({ sources: ["os_csprng"], quantum: false, quantum_bytes: 0,
                                                failures: { lfd: "unavailable" } })} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Quantum sources unavailable: this result came from the OS CSPRNG only and is labelled not quantum.");
    expect(screen.getByRole("status")).toHaveTextContent("Unavailable for this request: LfD QRNG.");
  });

  it("labels simulator-only output as not quantum", () => {
    render(<ProvenanceNotice provenance={prov({ sources: ["ibm_simulator"], quantum: false, quantum_bytes: 0 })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Only the IBM simulator contributed");
    expect(screen.getByRole("status")).toHaveTextContent("labelled not quantum");
  });

  it("flags a simulator that contributed next to a real source", () => {
    render(<ProvenanceNotice provenance={prov({ sources: ["ibm_simulator", "lfd"] })} />);
    expect(screen.getByRole("status")).toHaveTextContent("The IBM simulator also contributed. Simulator output is not quantum.");
    expect(screen.queryByText(/were unavailable/)).not.toBeInTheDocument();
  });

  it("never lists an unavailable source as contributing", () => {
    render(<ProvenanceNotice provenance={prov({ sources: ["lfd"], failures: { anu: "unavailable" } })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Contributing: LfD QRNG.");
    expect(screen.getByRole("status")).toHaveTextContent("Unavailable for this request: ANU QRNG.");
  });
});
