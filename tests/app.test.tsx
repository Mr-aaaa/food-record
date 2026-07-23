import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

test("renders the product name", () => {
  render(<HomePage />);
  expect(
    screen.getByRole("heading", { name: "今日营养概览" }),
  ).toBeInTheDocument();
});
