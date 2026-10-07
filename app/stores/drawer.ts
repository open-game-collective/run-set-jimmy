import { atom } from "nanostores";

export type DrawerState = {
  isOpen: boolean;
  activeSnapPoint: number | string | null;
};

export const $drawerState = atom<DrawerState>({
  isOpen: false,
  activeSnapPoint: "25vh",
});

// Add listener for debugging
$drawerState.listen((state) => {
  console.log("Drawer state changed:", state);
});

export const setDrawerOpen = (isOpen: boolean) => {
  $drawerState.set({
    ...$drawerState.get(),
    isOpen,
  });
};

export const setSnapPoint = (point: number | string | null) => {
  $drawerState.set({
    ...$drawerState.get(),
    activeSnapPoint: point,
  });
};
