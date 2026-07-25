import type { RouteLoadingVariant } from "@/components/app-state"

type ConsoleErrorPresentation = {
  description: string
  showAction: boolean
  title: string
}

type ConsoleLoadingPresentation = {
  label: string
  showAction: boolean
  variant: RouteLoadingVariant
}

export const getConsoleErrorPresentation = (
  pathname: string
): ConsoleErrorPresentation => {
  if (
    pathname === "/dashboard" ||
    /^\/organization\/[^/]+\/dashboard(?:\/|$)/.test(pathname)
  ) {
    return {
      title: "Overview",
      description: "Everything your team needs is temporarily unavailable.",
      showAction: true,
    }
  }

  if (
    pathname.startsWith("/dashboard/todos") ||
    /^\/organization\/[^/]+\/issues(?:\/|$)/.test(pathname)
  ) {
    return {
      title: "Issues",
      description:
        "Track work for this organization. Switch organizations from the sidebar.",
      showAction: false,
    }
  }

  if (pathname === "/settings/organizations") {
    return {
      title: "Organizations",
      description:
        "Choose the tenant context for this session or create a new workspace.",
      showAction: true,
    }
  }

  if (pathname === "/settings/account") {
    return {
      title: "Account settings",
      description: "Manage your profile and active sessions from one place.",
      showAction: false,
    }
  }

  if (/^\/organization\/[^/]+\/members(?:\/|$)/.test(pathname)) {
    return {
      title: "Members",
      description: "Manage users and permissions for this organization.",
      showAction: false,
    }
  }

  if (/^\/organization\/[^/]+\/settings(?:\/|$)/.test(pathname)) {
    return {
      title: "Organization settings",
      description:
        "Manage identity and sensitive controls for this organization.",
      showAction: false,
    }
  }

  return {
    title: "Workspace",
    description:
      "This workspace view is unavailable. Your data was not changed.",
    showAction: false,
  }
}

export const getConsoleLoadingPresentation = (
  pathname: string
): ConsoleLoadingPresentation => {
  if (
    pathname === "/dashboard" ||
    /^\/organization\/[^/]+\/dashboard(?:\/|$)/.test(pathname)
  ) {
    return {
      label: "Loading organization dashboard",
      showAction: true,
      variant: "dashboard",
    }
  }

  if (
    pathname.startsWith("/dashboard/todos") ||
    /^\/organization\/[^/]+\/issues(?:\/|$)/.test(pathname)
  ) {
    return {
      label: "Loading organization issues",
      showAction: false,
      variant: "issues",
    }
  }

  if (pathname === "/settings/organizations") {
    return {
      label: "Loading organizations",
      showAction: true,
      variant: "table",
    }
  }

  if (/^\/organization\/[^/]+\/members(?:\/|$)/.test(pathname)) {
    return {
      label: "Loading organization members",
      showAction: false,
      variant: "members",
    }
  }

  if (/^\/organization\/[^/]+\/settings(?:\/|$)/.test(pathname)) {
    return {
      label: "Loading organization settings",
      showAction: false,
      variant: "organization-settings",
    }
  }

  return {
    label: "Loading workspace settings",
    showAction: false,
    variant: "form",
  }
}
