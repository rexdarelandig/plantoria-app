import type { Plant, Location } from "@/lib/laravel";
import PlantsPage from "./page";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const laravelMocks = vi.hoisted(() => ({
  getPlants: vi.fn(),
  getLocations: vi.fn(),
  deletePlant: vi.fn(),
  updatePlant: vi.fn(),
  createPlant: vi.fn(),
}));

vi.mock("@/lib/laravel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/laravel")>()),
  getPlants: laravelMocks.getPlants,
  getLocations: laravelMocks.getLocations,
  deletePlant: laravelMocks.deletePlant,
  updatePlant: laravelMocks.updatePlant,
  createPlant: laravelMocks.createPlant,
}));

const mockAuthState = vi.hoisted(() => ({
  token: "test-token",
  ready: true,
  user: { email: "user@example.com" } as const,
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => mockAuthState,
}));

const locationFixture: Location = {
  id: 10,
  name: "Living room",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  user_id: 1,
};

const plantFixture = (over: Partial<Plant> = {}): Plant => ({
  id: 1,
  name: "Ficus",
  scientific_name: "Ficus benjamina",
  description: "A tree",
  image_url: "",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
  user_id: 1,
  location_id: locationFixture.id,
  ...over,
});

function renderPlants() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<PlantsPage />, { wrapper: Wrapper });
}

describe("PlantsPage", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    laravelMocks.getLocations.mockResolvedValue([locationFixture]);
    laravelMocks.getPlants.mockResolvedValue({
      plants: [plantFixture()],
      meta: { currentPage: 1, lastPage: 1, perPage: 10, total: 1 },
    });
    laravelMocks.deletePlant.mockResolvedValue(undefined);
    laravelMocks.updatePlant.mockImplementation(async (_token, id, payload) =>
      plantFixture({
        id,
        name: payload.name,
        description: payload.description,
        scientific_name: payload.scientific_name ?? "",
        location_id: payload.location_id,
      }),
    );
    laravelMocks.createPlant.mockImplementation(async (_token, payload) =>
      plantFixture({
        id: 42,
        name: payload.name,
        description: payload.description,
        scientific_name: payload.scientific_name ?? "",
        location_id: payload.location_id ?? null,
      }),
    );
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("deletes a plant after confirming", async () => {
    const user = userEvent.setup();
    renderPlants();

    await screen.findByRole("heading", { name: "Plants" });
    expect(await screen.findByText("Ficus")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Delete Ficus/i }));

    await screen.findByRole("heading", { name: "Delete plant?" });
    await user.click(screen.getByRole("button", { name: "Delete", exact: true }));

    await waitFor(() =>
      expect(laravelMocks.deletePlant).toHaveBeenCalledWith(mockAuthState.token, 1),
    );
  });

  it("updates a plant from the edit dialog", async () => {
    const user = userEvent.setup();
    renderPlants();

    await screen.findByText("Ficus");
    await user.click(screen.getByRole("button", { name: /Edit Ficus/i }));

    expect(await screen.findByRole("heading", { name: "Edit plant" })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/^Name\b/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Rubber Plant");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(laravelMocks.updatePlant).toHaveBeenCalledWith(
        mockAuthState.token,
        1,
        expect.objectContaining({
          name: "Rubber Plant",
          description: "A tree",
          scientific_name: "Ficus benjamina",
          location_id: locationFixture.id,
        }),
      ),
    );
  });

  it("adds a plant via Trefle lookup and save", async () => {
    const treflePlant = {
      id: 99,
      common_name: "Snake plant",
      scientific_name: "Dracaena trifasciata",
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      if (!url.includes("/api/trefle/plants/search")) {
        return originalFetch(input);
      }
      return new Response(
        JSON.stringify({ data: [treflePlant] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    let plantsFetchCount = 0;
    laravelMocks.getPlants.mockImplementation(async () => {
      plantsFetchCount++;
      if (plantsFetchCount === 1) {
        return {
          plants: [],
          meta: { currentPage: 1, lastPage: 1, perPage: 10, total: 0 },
        };
      }
      return {
        plants: [
          plantFixture({
            id: 42,
            name: "Snake plant",
            scientific_name: "Dracaena trifasciata",
          }),
        ],
        meta: { currentPage: 1, lastPage: 1, perPage: 10, total: 1 },
      };
    });

    const user = userEvent.setup();
    renderPlants();

    await screen.findByText("No plants yet.");

    await user.click(screen.getByRole("button", { name: "Add Plant" }));
    await screen.findByRole("heading", { name: "Add plant" });

    await user.type(screen.getByPlaceholderText(/Monstera|snake plant/i), "snake");

    await user.click(screen.getByRole("button", { name: /Look up on Trefle/i }));

    const snakeOption = await screen.findByRole("button", {
      name: /Snake plant/i,
    });
    await user.click(snakeOption);

    const locationSelect = screen.getByLabelText(/^Location\b/i);
    await user.selectOptions(locationSelect, String(locationFixture.id));

    await user.click(screen.getByRole("button", { name: "Save plant" }));

    await waitFor(() =>
      expect(laravelMocks.createPlant).toHaveBeenCalledWith(
        mockAuthState.token,
        expect.objectContaining({
          name: "Snake plant",
          location_id: locationFixture.id,
          trefle_id: treflePlant.id,
          scientific_name: treflePlant.scientific_name,
        }),
      ),
    );

    expect(await screen.findByText("Snake plant")).toBeInTheDocument();
  });
});
