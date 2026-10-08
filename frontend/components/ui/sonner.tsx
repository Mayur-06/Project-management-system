"use client"

import {
  CircleCheck,
  Info,
  LoaderCircle,
  OctagonX,
  TriangleAlert,
} from "lucide-react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheck className="h-4 w-4" />,
        info: <Info className="h-4 w-4" />,
        warning: <TriangleAlert className="h-4 w-4" />,
        error: <OctagonX className="h-4 w-4" />,
        loading: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#141517] group-[.toaster]:text-[#f7f8f8] group-[.toaster]:border group-[.toaster]:border-white/[0.08] group-[.toaster]:shadow-2xl font-sans text-xs",
          description: "group-[.toast]:text-zinc-400 text-xs",
          actionButton:
            "group-[.toast]:bg-[#5e6ad2] group-[.toast]:text-white font-medium",
          cancelButton:
            "group-[.toast]:bg-white/[0.08] group-[.toast]:text-zinc-300",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
