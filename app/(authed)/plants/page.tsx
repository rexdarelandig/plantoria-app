import { GridIcon, ListIcon } from "lucide-react"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function PlantsPage() {
  return (
    <main className="flex flex-1 flex-col gap-2 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Plants
      </h1>
      <p className="text-muted-foreground mb-6">
        Manage your plants from this page.
      </p>
      <Button className="w-fit">Add Plant</Button>
      <Tabs defaultValue="grid" className="w-full">
      <TabsList variant="line" className="ml-auto">
        <TabsTrigger value="grid"><GridIcon /> Grid View</TabsTrigger>
        <TabsTrigger value="list"><ListIcon /> List View</TabsTrigger>
      </TabsList>
      <TabsContent value="grid">
        <Card>
          <CardHeader>
            <CardTitle>Grid View</CardTitle>
            <CardDescription>
              View your key metrics and recent project activity. Track progress
              across all your active projects.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            You have 12 active projects and 3 pending tasks.
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="list">
        <Card>
          <CardHeader>
            <CardTitle>List View</CardTitle>
            <CardDescription>
              Track performance and user engagement metrics. Monitor trends and
              identify growth opportunities.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Page views are up 25% compared to last month.
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
    </main>
  );
}
