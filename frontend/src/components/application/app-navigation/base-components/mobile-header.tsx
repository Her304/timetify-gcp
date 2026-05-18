import type { PropsWithChildren } from "react";
import { X as CloseIcon, Menu02 } from "@untitledui/icons";
import {
    Button as AriaButton,
    Dialog as AriaDialog,
    DialogTrigger as AriaDialogTrigger,
    Modal as AriaModal,
    ModalOverlay as AriaModalOverlay,
} from "react-aria-components";
import { UntitledLogo } from "@/components/foundations/logo/untitledui-logo";
import { cx } from "@/utils/cx";

export const MobileNavigationHeader = ({ children }: PropsWithChildren) => {
    return (
        <AriaDialogTrigger>
            <header className="flex h-14 items-center justify-between border-b border-secondary bg-primary/70 backdrop-blur-md p-3 pl-4 lg:hidden sticky top-0 z-40">
                <a
                    aria-label="Go to homepage"
                    href="/"
                    className="rounded-xs outline-focus-ring focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl text-coral font-normal" style={{ fontFamily: "'Bricolage Grotesque', sans-serif" }}>timetify</h2>
                        <span className="px-1.5 py-0.5 text-[10px] leading-none font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full">Beta</span>
                    </div>
                </a>

                <AriaButton
                    aria-label="Expand navigation menu"
                    className="group flex items-center justify-center rounded-none bg-primary p-2 text-fg-secondary outline-focus-ring hover:bg-primary_hover hover:text-fg-secondary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                    <Menu02 className="size-6 transition duration-200 ease-in-out group-aria-expanded:opacity-0" />
                    <CloseIcon className="absolute size-6 opacity-0 transition duration-200 ease-in-out group-aria-expanded:opacity-100" />
                </AriaButton>
            </header>

            <AriaModalOverlay
                isDismissable
                className={({ isEntering, isExiting }) =>
                    cx(
                        "fixed inset-0 z-50 cursor-pointer bg-white/60 pr-16 backdrop-blur-md lg:hidden",
                        isEntering && "duration-300 ease-in-out animate-in fade-in",
                        isExiting && "duration-200 ease-in-out animate-out fade-out",
                    )
                }
            >
                {({ state }) => (
                    <>
                        <AriaButton
                            aria-label="Close navigation menu"
                            onPress={() => state.close()}
                            className="fixed top-2.5 right-3 flex cursor-pointer items-center justify-center rounded-none p-2 text-fg-white/70 outline-focus-ring hover:bg-white/10 hover:text-fg-white focus-visible:outline-2 focus-visible:outline-offset-2"
                        >
                            <CloseIcon className="size-6" />
                        </AriaButton>

                        <AriaModal className="w-full max-w-74 cursor-auto will-change-transform">
                            <AriaDialog className="h-dvh outline-hidden focus:outline-hidden">{children}</AriaDialog>
                        </AriaModal>
                    </>
                )}
            </AriaModalOverlay>
        </AriaDialogTrigger>
    );
};
