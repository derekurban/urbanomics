import React from "react";
import { Icon } from "@derekurban/design-system";
export function Chevron({ right = false }) {
  return <Icon name={right ? "chevron-right" : "chevron-left"} size={18} />;
}
