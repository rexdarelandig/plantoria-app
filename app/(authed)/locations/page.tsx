"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, TrashIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AddLocationDialog } from "@/components/add-location-dialog";
import { Button } from "@/components/ui/button";
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
import { useAuth } from "@/lib/auth-context";
import {
  deleteLocation,
  getLocations,
  type Location,
  type LocationSortField,
  updateLocation,
} from "@/lib/laravel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

const selectClass =
  "h-9 w-full min-w-[8.5rem] rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 md:w-auto dark:bg-input/30";

const SEARCH_DEBOUNCE_MS = 400;

function compareLocations(
  a: { name: string; created_at: string; updated_at: string },
  b: { name: string; created_at: string; updated_at: string },
  sortKey: LocationSortField,
  sortDir: "asc" | "desc"
): number {
  const dir = sortDir === "asc" ? 1 : -1;
  if (sortKey === "name") {
    const av = String(a[sortKey] ?? "").toLowerCase();
    const bv = String(b[sortKey] ?? "").toLowerCase();
    return av.localeCompare(bv) * dir;
  }
  const at = new Date(a.created_at).getTime();
  const bt = new Date(b.created_at).getTime();
  return (at - bt) * dir;
}

export default function LocationsPage() {
  const { token, ready, user } = useAuth();
  const queryClient = useQueryClient();

  const [sortKey, setSortKey] = useState<LocationSortField>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Location | null>(null);
  const [editTarget, setEditTarget] = useState<Location | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteLocation(token, id),
    onSuccess: async (_, deletedId) => {
      const prev = queryClient.getQueryData<Location[]>(["locations", token]);
      const removed = prev?.find((l) => l.id === deletedId);
      queryClient.setQueryData<Location[]>(
        ["locations", token],
        (prevList) => (prevList ?? []).filter((l) => l.id !== deletedId),
      );
      await queryClient.refetchQueries({ queryKey: ["locations", token] });
      setDeleteTarget(null);
      toast.success(
        removed ? `"${removed.name}" was deleted.` : "Location deleted.",
      );
    },
  });

  const editMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: number;
      payload: { name: string; description: string };
    }) => updateLocation(token, id, payload),
    onSuccess: async (updated) => {
      queryClient.setQueryData<Location[]>(
        ["locations", token],
        (prev) =>
          (prev ?? []).map((l) => (l.id === updated.id ? updated : l)),
      );
      await queryClient.refetchQueries({ queryKey: ["locations", token] });
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

  const {
    data: allLocations = [],
    isPending,
    isError,
    error,
    isFetching,
  } = useQuery({
    queryKey: ["locations", token],
    queryFn: ({ signal }) => getLocations(token, { signal }),
    enabled: ready && user !== null,
  });

  const normalizedSearch = debouncedSearch.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedSearch) return allLocations;
    return allLocations.filter((loc) => {
      const hay = [loc.name, loc.description ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(normalizedSearch);
    });
  }, [allLocations, normalizedSearch]);

  const sorted = useMemo(() => {
    const next = [...filtered];
    next.sort((a, b) => compareLocations(a, b, sortKey, sortDir));
    return next;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  const showControls = ready && user !== null && !isError;
  const empty = !isPending && !isError && total === 0;

  return (
    <main className="flex flex-1 flex-col gap-2 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Locations
      </h1>
      <p className="mb-6 text-muted-foreground">
        Manage your locations from this page.
      </p>
      {isError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error instanceof Error ? error.message : "Could not load locations."}
        </p>
      ) : null}
      <AddLocationDialog />
      {showControls ? (
        <div className="mt-4 flex flex-col gap-3 border-b border-border pb-4">
          <div className="flex flex-col gap-1.5 sm:max-w-md">
            <Label htmlFor="location-search" className="text-xs">
              Search
            </Label>
            <Input
              id="location-search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Name, description…"
              className="h-9"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Filters after you stop typing (~{SEARCH_DEBOUNCE_MS / 1000}s).
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sort-key" className="text-xs">
                  Sort by
                </Label>
                <select
                  id="sort-key"
                  className={selectClass}
                  value={sortKey}
                  onChange={(e) => {
                    setSortKey(e.target.value as LocationSortField);
                    setPage(1);
                  }}
                >
                  <option value="created_at">Last created</option>
                  <option value="name">Name</option>
                  <option value="updated_at">Last updated</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sort-dir" className="text-xs">
                  Order
                </Label>
                <select
                  id="sort-dir"
                  className={selectClass}
                  value={sortDir}
                  onChange={(e) => {
                    setSortDir(e.target.value as "asc" | "desc");
                    setPage(1);
                  }}
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="page-size" className="text-xs">
                  Per page
                </Label>
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground sm:text-sm">
                Page {safePage} of {totalPages}
                <span className="text-muted-foreground/80">
                  {" "}
                  · {total} location
                  {total !== 1 ? "s" : ""}
                </span>
                {isFetching ? (
                  <span className="text-muted-foreground/80"> · …</span>
                ) : null}
              </p>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={safePage <= 1 || isPending}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={safePage >= totalPages || isPending}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading locations…</p>
      ) : isError ? null : empty ? (
        <p className="text-sm text-muted-foreground">
          {debouncedSearch.trim()
            ? "No locations match your search."
            : "No locations yet."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="hidden lg:table-cell">
                Updated
              </TableHead>
              <TableHead className="hidden text-right lg:table-cell">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageSlice.map((location) => (
              <TableRow key={location.id}>
                <TableCell className="max-w-[140px] font-medium">
                  <div className="truncate">{location.name}</div>
                </TableCell>
                <TableCell className="max-w-[min(28rem,40vw)] whitespace-normal text-muted-foreground">
                  <p className="line-clamp-2 text-pretty text-sm">
                    {location.description?.trim()
                      ? location.description
                      : "—"}
                  </p>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                  {new Date(location.updated_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-right lg:table-cell">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Edit ${location.name}`}
                    disabled={
                      deleteMutation.isPending ||
                      (editMutation.isPending &&
                        editTarget?.id === location.id)
                    }
                    onClick={() => {
                      setEditTarget(location);
                      setEditName(location.name);
                      setEditDescription(location.description ?? "");
                    }}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    className="ml-2"
                    variant="destructive"
                    size="icon-sm"
                    aria-label={`Delete ${location.name}`}
                    disabled={
                      deleteMutation.isPending ||
                      (editMutation.isPending &&
                        editTarget?.id === location.id)
                    }
                    onClick={() => setDeleteTarget(location)}
                  >
                    <TrashIcon className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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
            <DialogTitle>Delete location?</DialogTitle>
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
                : "Could not delete location."}
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
            editMutation.reset();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={!editMutation.isPending}
        >
          <DialogHeader>
            <DialogTitle>Edit location</DialogTitle>
            <DialogDescription>
              Update the name and description for this location.
            </DialogDescription>
          </DialogHeader>
          {editMutation.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {editMutation.error instanceof Error
                ? editMutation.error.message
                : "Could not update location."}
            </p>
          ) : null}
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <Field>
              <FieldLabel htmlFor="edit-location-name">
                Location name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="edit-location-name"
                value={editName}
                onChange={(ev) => setEditName(ev.target.value)}
                className="h-9"
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor="edit-location-description">Description</Label>
                <Textarea
                  id="edit-location-description"
                  value={editDescription}
                  onChange={(ev) => setEditDescription(ev.target.value)}
                  placeholder="Care notes, location, or other details"
                  rows={4}
                />
              </div>
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
