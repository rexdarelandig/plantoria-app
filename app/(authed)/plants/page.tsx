"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  GridIcon,
  LeafIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth-context";
import { AddPlantDialog } from "@/components/add-plant-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deletePlant,
  getLocations,
  getPlants,
  type Location,
  type Plant,
  type PlantsListResult,
  type PlantSortField,
  type PlantSortRule,
  updatePlant,
} from "@/lib/laravel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

const selectClass =
  "h-9 w-full min-w-[8.5rem] rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 md:w-auto dark:bg-input/30";

const SEARCH_DEBOUNCE_MS = 400;

const PLANT_SORT_FIELDS: PlantSortField[] = [
  "created_at",
  "name",
  "scientific_name",
  "updated_at",
];

const PLANT_SORT_LABELS: Record<PlantSortField, string> = {
  created_at: "Last created",
  name: "Name",
  scientific_name: "Scientific name",
  updated_at: "Last updated",
};

type SortDraftRow = PlantSortRule & { id: string };

function draftRowsToRules(rows: SortDraftRow[]): PlantSortRule[] {
  return rows.map(({ field, direction }) => ({ field, direction }));
}

function sortRulesEqual(a: PlantSortRule[], b: PlantSortRule[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => x.field === b[i].field && x.direction === b[i].direction)
  );
}

function availableFieldsForRow(
  rows: SortDraftRow[],
  rowIndex: number,
): PlantSortField[] {
  const current = rows[rowIndex]?.field;
  const taken = new Set(
    rows
      .map((r, i) => (i === rowIndex ? undefined : r.field))
      .filter((f): f is PlantSortField => f !== undefined),
  );
  return PLANT_SORT_FIELDS.filter((f) => f === current || !taken.has(f));
}

function plantLocationLabel(plant: Plant, locations: Location[]): string {
  const nested = plant.location;
  if (nested?.name?.trim()) return nested.name;
  const lid = plant.location_id;
  if (typeof lid === "number") {
    const match = locations.find((l) => l.id === lid);
    if (match) return match.name;
  }
  return "—";
}

export default function PlantsPage() {
  const { token, ready, user } = useAuth();
  const queryClient = useQueryClient();

  const [sortDraftRows, setSortDraftRows] = useState<SortDraftRow[]>([
    { id: "sort-1", field: "created_at", direction: "desc" },
  ]);
  const [sortAppliedRules, setSortAppliedRules] = useState<PlantSortRule[]>([
    { field: "created_at", direction: "desc" },
  ]);
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Plant | null>(null);
  const [editTarget, setEditTarget] = useState<Plant | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editScientificName, setEditScientificName] = useState("");
  const [editLocationId, setEditLocationId] = useState("");
  const [detailPlant, setDetailPlant] = useState<Plant | null>(null);

  const invalidatePlantQueries = () =>
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "plants",
    });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deletePlant(token, id),
    onSuccess: async (_, deletedId) => {
      const caches = queryClient.getQueriesData<PlantsListResult>({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "plants",
      });
      let removed: Plant | undefined;
      for (const [, data] of caches) {
        removed = data?.plants?.find((p) => p.id === deletedId);
        if (removed) break;
      }
      await invalidatePlantQueries();
      setDeleteTarget(null);
      toast.success(
        removed ? `"${removed.name}" was deleted.` : "Plant deleted.",
      );
    },
  });

  const editMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: {
        name: string;
        description: string;
        scientific_name: string;
        location_id: number | null;
      };
    }) => updatePlant(token, id, payload),
    onSuccess: async (updated) => {
      await invalidatePlantQueries();
      setEditTarget(null);
      toast.success(`"${updated.name}" was updated.`);
    },
  });

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch((prev) => {
        if (prev !== searchDraft) {
          setPage(1);
        }
        return searchDraft;
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

  const sortAppliedKey = useMemo(
    () => sortAppliedRules.map((r) => `${r.field}:${r.direction}`).join("|"),
    [sortAppliedRules],
  );

  const sortDirty = useMemo(
    () => !sortRulesEqual(draftRowsToRules(sortDraftRows), sortAppliedRules),
    [sortDraftRows, sortAppliedRules],
  );

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: [
      "plants",
      token,
      page,
      pageSize,
      sortAppliedKey,
      debouncedSearch,
    ],
    queryFn: ({ signal }) =>
      getPlants(
        token,
        {
          page,
          perPage: pageSize,
          sortRules: sortAppliedRules,
          search: debouncedSearch.trim() || undefined,
        },
        { signal },
      ),
    placeholderData: keepPreviousData,
    enabled: ready && user !== null,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations", token],
    queryFn: ({ signal }) => getLocations(token, { signal }),
    enabled: ready && user !== null,
  });

  const plants = data?.plants ?? [];
  const meta = data?.meta ?? {
    currentPage: 1,
    lastPage: 1,
    perPage: pageSize,
    total: 0,
  };

  const totalPages = Math.max(1, meta.lastPage);
  const currentPage = Math.min(Math.max(1, meta.currentPage), totalPages);

  const showControls = ready && user !== null && !isError;
  const empty = !isPending && !isError && meta.total === 0;

  return (
    <main className="flex flex-1 flex-col gap-2 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Plants
      </h1>
      <p className="mb-6 text-muted-foreground">
        Manage your plants from this page.
      </p>
      {isError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : "Could not load plants."}
        </p>
      ) : null}
      <AddPlantDialog />
      <Tabs defaultValue="grid" className="w-full">
        <TabsList variant="line" className="ml-auto">
          <TabsTrigger value="grid">
            <GridIcon /> Grid View
          </TabsTrigger>
          <TabsTrigger value="list">
            <ListIcon /> List View
          </TabsTrigger>
        </TabsList>

        {showControls ? (
          <div className="mt-4 flex flex-col gap-3 border-b border-border pb-4">
            <div className="flex flex-col gap-1.5 sm:max-w-md">
              <Label htmlFor="plant-search" className="text-xs">
                Search
              </Label>
              <Input
                id="plant-search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Name, description, scientific name…"
                className="h-9"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Filters after you stop typing (~{SEARCH_DEBOUNCE_MS / 1000}s).
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="text-xs">Sort</Label>
                    {sortDirty ? (
                      <span className="text-xs text-muted-foreground">
                        Unapplied changes
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {sortDraftRows.map((row, rowIndex) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                          <Label
                            htmlFor={`sort-field-${row.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            {rowIndex === 0 ? "Sort by" : "Then by"}
                          </Label>
                          <select
                            id={`sort-field-${row.id}`}
                            className={selectClass}
                            value={row.field}
                            onChange={(e) => {
                              const field = e.target.value as PlantSortField;
                              setSortDraftRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id ? { ...r, field } : r,
                                ),
                              );
                            }}
                          >
                            {availableFieldsForRow(sortDraftRows, rowIndex).map(
                              (f) => (
                                <option key={f} value={f}>
                                  {PLANT_SORT_LABELS[f]}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                        <div className="flex min-w-32 flex-col gap-1.5">
                          <Label
                            htmlFor={`sort-dir-${row.id}`}
                            className="text-xs text-muted-foreground"
                          >
                            Order
                          </Label>
                          <select
                            id={`sort-dir-${row.id}`}
                            className={selectClass}
                            value={row.direction}
                            onChange={(e) => {
                              const direction = e.target.value as
                                | "asc"
                                | "desc";
                              setSortDraftRows((prev) =>
                                prev.map((r) =>
                                  r.id === row.id ? { ...r, direction } : r,
                                ),
                              );
                            }}
                          >
                            <option value="asc">Ascending</option>
                            <option value="desc">Descending</option>
                          </select>
                        </div>
                        {sortDraftRows.length > 1 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="shrink-0"
                            aria-label={`Remove sort level ${rowIndex + 1}`}
                            onClick={() =>
                              setSortDraftRows((prev) =>
                                prev.filter((r) => r.id !== row.id),
                              )
                            }
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={
                        sortDraftRows.length >= PLANT_SORT_FIELDS.length
                      }
                      onClick={() => {
                        const used = new Set(sortDraftRows.map((r) => r.field));
                        const nextField = PLANT_SORT_FIELDS.find(
                          (f) => !used.has(f),
                        );
                        if (!nextField) return;
                        setSortDraftRows((prev) => [
                          ...prev,
                          {
                            id:
                              typeof crypto !== "undefined" && crypto.randomUUID
                                ? crypto.randomUUID()
                                : `sort-${Date.now()}`,
                            field: nextField,
                            direction: "asc",
                          },
                        ]);
                      }}
                    >
                      <PlusIcon className="size-4" aria-hidden />
                      Add sort
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!sortDirty}
                      onClick={() => {
                        setSortAppliedRules(draftRowsToRules(sortDraftRows));
                        setPage(1);
                      }}
                    >
                      Apply sort
                    </Button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Page {currentPage} of {totalPages}
                  <span className="text-muted-foreground/80">
                    {" "}
                    · {meta.total} plant
                    {meta.total !== 1 ? "s" : ""}
                  </span>
                  {isFetching ? (
                    <span className="text-muted-foreground/80"> · …</span>
                  ) : null}
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1.5">
                    <select
                      id="page-size"
                      className={selectClass}
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(
                          Number(
                            e.target.value,
                          ) as (typeof PAGE_SIZE_OPTIONS)[number],
                        );
                        setPage(1);
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Previous page"
                      disabled={currentPage <= 1 || isPending}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeftIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label="Next page"
                      disabled={currentPage >= totalPages || isPending}
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                    >
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <TabsContent value="grid">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading plants…</p>
          ) : isError ? null : empty ? (
            <p className="text-sm text-muted-foreground">
              {debouncedSearch.trim()
                ? "No plants match your search."
                : "No plants yet."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plants.map((plant) => (
                <Card
                  key={plant.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View details for ${plant.name}`}
                  className="cursor-pointer gap-0 overflow-hidden p-0 outline-none transition-all duration-300 hover:scale-[1.01] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  onClick={() => setDetailPlant(plant)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDetailPlant(plant);
                    }
                  }}
                >
                  <div className="relative aspect-4/3 w-full bg-muted">
                    {plant.image_url ? (
                      <Image
                        src={plant.image_url}
                        alt={plant.name}
                        fill
                        unoptimized
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full min-h-36 items-center justify-center">
                        <LeafIcon
                          className="size-12 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                    )}
                  </div>
                  <CardHeader className="px-4 pt-4">
                    <CardTitle>{plant.name}</CardTitle>
                    {plant.scientific_name ? (
                      <CardDescription className="text-pretty italic">
                        {plant.scientific_name}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  <p className="px-4 pb-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/90">
                      Location
                    </span>{" "}
                    {plantLocationLabel(plant, locations)}
                  </p>
                  <CardContent className="px-4 pb-4 pt-0">
                    <p className="line-clamp-4 text-pretty text-sm text-muted-foreground">
                      {plant.description ?? "—"}
                    </p>
                  </CardContent>
                  <CardFooter className="flex justify-end gap-1 border-t border-border bg-muted/30 px-4 py-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Edit ${plant.name}`}
                      disabled={
                        deleteMutation.isPending ||
                        (editMutation.isPending && editTarget?.id === plant.id)
                      }
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setEditTarget(plant);
                        setEditName(plant.name);
                        setEditDescription(plant.description ?? "");
                        setEditScientificName(plant.scientific_name ?? "");
                        setEditLocationId(
                          plant.location_id != null
                            ? String(plant.location_id)
                            : "",
                        );
                      }}
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon-sm"
                      aria-label={`Delete ${plant.name}`}
                      disabled={
                        deleteMutation.isPending ||
                        (editMutation.isPending && editTarget?.id === plant.id)
                      }
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setDeleteTarget(plant);
                      }}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="list">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading plants…</p>
          ) : isError ? null : empty ? (
            <p className="text-sm text-muted-foreground">
              {debouncedSearch.trim()
                ? "No plants match your search."
                : "No plants yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">
                    <span className="sr-only">Image</span>
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Scientific name
                  </TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="hidden max-w-40 md:table-cell">
                    Location
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Updated
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plants.map((plant) => (
                  <TableRow key={plant.id}>
                    <TableCell className="w-16 p-2 align-middle">
                      <div className="relative size-12 overflow-hidden rounded-md bg-muted">
                        {plant.image_url ? (
                          <Image
                            src={plant.image_url}
                            alt=""
                            width={48}
                            height={48}
                            unoptimized
                            className="size-12 object-cover"
                          />
                        ) : (
                          <div className="flex size-12 items-center justify-center">
                            <LeafIcon
                              className="size-5 text-muted-foreground"
                              aria-hidden
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[140px] font-medium">
                      <div className="truncate">{plant.name}</div>
                      {plant.scientific_name ? (
                        <div className="truncate text-xs font-normal italic text-muted-foreground sm:hidden">
                          {plant.scientific_name}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden max-w-[180px] whitespace-normal italic text-muted-foreground sm:table-cell">
                      <span className="line-clamp-2 text-pretty">
                        {plant.scientific_name || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[min(28rem,40vw)] whitespace-normal text-muted-foreground">
                      <p className="line-clamp-2 text-pretty text-sm">
                        {plant.description?.trim() ? plant.description : "—"}
                      </p>
                    </TableCell>
                    <TableCell className="hidden max-w-40 truncate md:table-cell">
                      {plantLocationLabel(plant, locations)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                      {new Date(plant.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-right lg:table-cell">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`View ${plant.name}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setDetailPlant(plant);
                        }}
                      >
                        <EyeIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        aria-label={`Edit ${plant.name}`}
                        className="ml-2"
                        disabled={
                          deleteMutation.isPending ||
                          (editMutation.isPending &&
                            editTarget?.id === plant.id)
                        }
                        onClick={() => {
                          setEditTarget(plant);
                          setEditName(plant.name);
                          setEditDescription(plant.description ?? "");
                          setEditScientificName(plant.scientific_name ?? "");
                          setEditLocationId(
                            plant.location_id != null
                              ? String(plant.location_id)
                              : "",
                          );
                        }}
                      >
                        <PencilIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        className="ml-2"
                        variant="destructive"
                        size="icon-sm"
                        aria-label={`Delete ${plant.name}`}
                        disabled={
                          deleteMutation.isPending ||
                          (editMutation.isPending &&
                            editTarget?.id === plant.id)
                        }
                        onClick={() => setDeleteTarget(plant)}
                      >
                        <TrashIcon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
      <Dialog
        open={detailPlant !== null}
        onOpenChange={(open) => {
          if (!open) setDetailPlant(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {detailPlant ? (
            <>
              <DialogHeader>
                <DialogTitle>{detailPlant.name}</DialogTitle>
                {detailPlant.scientific_name?.trim() ? (
                  <DialogDescription className="text-pretty italic">
                    {detailPlant.scientific_name}
                  </DialogDescription>
                ) : (
                  <DialogDescription className="sr-only">
                    Plant details and photo.
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
                {detailPlant.image_url ? (
                  <Image
                    src={detailPlant.image_url}
                    alt={detailPlant.name}
                    fill
                    unoptimized
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 512px"
                  />
                ) : (
                  <div className="flex h-full min-h-40 items-center justify-center">
                    <LeafIcon
                      className="size-16 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                )}
              </div>
              <div className="grid gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Location
                  </p>
                  <p className="text-pretty text-foreground">
                    {plantLocationLabel(detailPlant, locations)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Description
                  </p>
                  <p className="text-pretty whitespace-pre-wrap text-foreground">
                    {detailPlant.description?.trim()
                      ? detailPlant.description
                      : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>
                    Added {new Date(detailPlant.created_at).toLocaleString()}
                  </span>
                  <span>
                    Updated {new Date(detailPlant.updated_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            deleteMutation.reset();
          }
        }}
      >
        <DialogContent showCloseButton={!deleteMutation.isPending}>
          <DialogHeader>
            <DialogTitle>Delete plant?</DialogTitle>
            <DialogDescription>
              This will permanently remove{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name}
              </span>
              . This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {deleteMutation.error instanceof Error
                ? deleteMutation.error.message
                : "Could not delete plant."}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => {
                setDeleteTarget(null);
                deleteMutation.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null);
            setEditLocationId("");
            editMutation.reset();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={!editMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>Edit plant</DialogTitle>
            <DialogDescription>
              Update the name, scientific name, location, and description.
            </DialogDescription>
          </DialogHeader>
          {editMutation.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {editMutation.error instanceof Error
                ? editMutation.error.message
                : "Could not update plant."}
            </p>
          ) : null}
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <Field>
              <FieldLabel htmlFor="edit-plant-name">
                Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="edit-plant-name"
                value={editName}
                onChange={(ev) => setEditName(ev.target.value)}
                className="h-9"
              />
              <Label htmlFor="edit-plant-scientific" className="mt-2">
                Scientific name
              </Label>
              <Input
                id="edit-plant-scientific"
                value={editScientificName}
                onChange={(ev) => setEditScientificName(ev.target.value)}
                className="h-9"
              />
              <Label htmlFor="edit-plant-location" className="mt-2">
                Location
              </Label>
              <select
                id="edit-plant-location"
                className={selectClass}
                value={editLocationId}
                onChange={(ev) => setEditLocationId(ev.target.value)}
              >
                <option value="">No location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
              <Label htmlFor="edit-plant-description" className="mt-2">
                Description
              </Label>
              <Textarea
                id="edit-plant-description"
                value={editDescription}
                onChange={(ev) => setEditDescription(ev.target.value)}
                placeholder="Care notes and other details"
                rows={4}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={editMutation.isPending}
              onClick={() => {
                setEditTarget(null);
                editMutation.reset();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={editMutation.isPending || !editName.trim()}
              onClick={() => {
                if (!editTarget) return;
                editMutation.mutate({
                  id: editTarget.id,
                  payload: {
                    name: editName.trim(),
                    description: editDescription.trim(),
                    scientific_name: editScientificName.trim(),
                    location_id:
                      editLocationId === "" ? null : Number(editLocationId),
                  },
                });
              }}
            >
              {editMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
