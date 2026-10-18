import { render, screen } from "@testing-library/react";

import { Unavailable } from "./Notices";

const auth = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/lib/auth/config", () => ({
  get clerkEnabled() {
    return auth.enabled;
  },
}));

describe("Unavailable", () => {
  afterEach(() => {
    auth.enabled = false;
  });

  it("asks a signed-out visitor to sign in when accounts are configured", () => {
    auth.enabled = true;
    render(<Unavailable result={{ state: "denied", status: 401 }} what="your receipts" />);

    expect(screen.getByText("Sign in to see your receipts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up");
  });

  it("tells a developer without accounts how to run the API locally instead of linking to a missing sign-in", () => {
    render(<Unavailable result={{ state: "denied", status: 401 }} what="your receipts" />);

    expect(screen.getByText("Start the backend in development mode")).toBeInTheDocument();
    expect(screen.getByText("ENVIRONMENT=development")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("explains an admin denial without promising that every attempt is logged", () => {
    const { container } = render(<Unavailable result={{ state: "denied", status: 403 }} what="the operations page" admin />);

    expect(screen.getByText(/Admins only/)).toBeInTheDocument();
    expect(container).toHaveTextContent("Denied attempts are recorded in the audit log");
    expect(container).not.toHaveTextContent(/every denied attempt/i);
  });

  it("does not reveal admin wording for a forbidden request on an account page", () => {
    render(<Unavailable result={{ state: "denied", status: 403 }} what="your usage" />);

    expect(screen.queryByText(/Admins only/)).not.toBeInTheDocument();
    expect(screen.getByText("The API has nothing to show for your usage.")).toBeInTheDocument();
  });

  it("announces a failure with its request id", () => {
    render(<Unavailable result={{ state: "failed", message: "Database is busy", requestId: "req-9" }} what="your usage" />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Could not load this page");
    expect(alert).toHaveTextContent("Database is busy");
    expect(screen.getByText("req-9")).toBeInTheDocument();
  });

  it("omits the request id line when the API sent none", () => {
    render(<Unavailable result={{ state: "failed", message: "The API could not be reached.", requestId: null }} what="x" />);
    expect(screen.queryByText(/Request ID/)).not.toBeInTheDocument();
  });
});
