import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { WifomeLoader } from "./components/wifome-loader";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultPendingMs: 120,
    defaultPendingMinMs: 1100,
    defaultPendingComponent: () => <WifomeLoader />,
  });

  return router;
};
