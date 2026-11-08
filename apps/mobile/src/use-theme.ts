import { themes, type Theme } from "@zaafran/ui-native";
import { useColorScheme } from "react-native";

export function useTheme(): Theme {
  return themes[useColorScheme() === "dark" ? "dark" : "light"];
}
