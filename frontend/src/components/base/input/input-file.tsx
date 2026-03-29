import { useState, type ReactNode } from "react";
import { Label } from "@/components/base/input/label";
import { HintText } from "@/components/base/input/hint-text";
import { cx } from "@/utils/cx";

export interface InputFileProps {
    label?: string;
    hint?: ReactNode;
    isRequired?: boolean;
    isLoading?: boolean;
    onChange?: (files: FileList | null) => void;
    className?: string;
}

export const InputFile = ({ label, hint, isRequired, isLoading, onChange, className }: InputFileProps) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isLoading) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (!isLoading && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onChange?.(e.dataTransfer.files);
        }
    };

    return (
        <div className={cx("group flex w-full flex-col gap-1.5", className)}>
            {label && (
                <Label isRequired={isRequired}>
                    {label}
                </Label>
            )}
            
            <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cx(
                    "relative mt-1 flex justify-center rounded-lg border border-dashed px-6 py-10 transition-colors",
                    isLoading ? "bg-gray-50 border-gray-300" : 
                    isDragging ? "border-blue-500 bg-blue-50/50" : "border-gray-900/25 hover:bg-gray-50"
                )}
            >
                <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.748 3.748 0 0118 19.5H6.75z" />
                    </svg>
                    <div className="mt-4 flex text-sm leading-6 text-gray-600 justify-center">
                        <label className="relative cursor-pointer rounded-md bg-transparent font-semibold text-blue-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 hover:text-blue-500">
                            <span>{isLoading ? "Uploading..." : "Upload a file"}</span>
                            <input 
                                type="file" 
                                className="sr-only" 
                                onChange={(e) => onChange?.(e.target.files)} 
                                disabled={isLoading}
                                accept=".pdf,.doc,.docx"
                            />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                    </div>
                </div>
            </div>

            {hint && <HintText>{hint}</HintText>}
        </div>
    );
};
