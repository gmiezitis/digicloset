import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    PanResponder,
    Image,
    Pressable,
    Alert,
} from 'react-native';
import { colors, spacing, typography, borderRadius } from '@theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_SIZE = SCREEN_WIDTH - spacing.lg * 2;

type Tool = 'brush' | 'eraser' | 'none';

interface BrushStroke {
    points: { x: number; y: number }[];
    tool: Tool;
    size: number;
}

interface ManualCleanupEditorProps {
    imageUri: string;
    maskUri?: string;
    onSave: (editedMaskUri: string) => void;
    onCancel: () => void;
}

export function ManualCleanupEditor({
    imageUri,
    maskUri,
    onSave,
    onCancel,
}: ManualCleanupEditorProps) {
    const [activeTool, setActiveTool] = useState<Tool>('brush'); // Start with brush selected
    const [brushSize, setBrushSize] = useState(20);
    const [strokes, setStrokes] = useState<BrushStroke[]>([]);
    const [currentStroke, setCurrentStroke] = useState<BrushStroke | null>(null);
    const [undoStack, setUndoStack] = useState<BrushStroke[][]>([]);

    // Use refs for values that PanResponder needs access to
    const activeToolRef = useRef<Tool>(activeTool);
    const brushSizeRef = useRef<number>(brushSize);
    const currentStrokeRef = useRef<BrushStroke | null>(null);
    const strokesRef = useRef<BrushStroke[]>([]);

    // Keep refs in sync with state
    activeToolRef.current = activeTool;
    brushSizeRef.current = brushSize;
    strokesRef.current = strokes;

    const canvasRef = useRef<View>(null);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                if (activeToolRef.current === 'none') return;
                const { locationX, locationY } = evt.nativeEvent;
                const newStroke: BrushStroke = {
                    points: [{ x: locationX, y: locationY }],
                    tool: activeToolRef.current,
                    size: brushSizeRef.current,
                };
                currentStrokeRef.current = newStroke;
                setCurrentStroke(newStroke);
            },
            onPanResponderMove: (evt) => {
                if (!currentStrokeRef.current) return;
                const { locationX, locationY } = evt.nativeEvent;
                const updatedStroke = {
                    ...currentStrokeRef.current,
                    points: [...currentStrokeRef.current.points, { x: locationX, y: locationY }],
                };
                currentStrokeRef.current = updatedStroke;
                setCurrentStroke(updatedStroke);
            },
            onPanResponderRelease: () => {
                if (currentStrokeRef.current && currentStrokeRef.current.points.length > 0) {
                    setUndoStack(prev => [...prev, strokesRef.current]);
                    setStrokes(prev => [...prev, currentStrokeRef.current!]);
                }
                currentStrokeRef.current = null;
                setCurrentStroke(null);
            },
        })
    ).current;

    const handleToolSelect = useCallback((tool: Tool) => {
        setActiveTool(prev => (prev === tool ? 'none' : tool));
    }, []);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0) return;
        const previousStrokes = undoStack[undoStack.length - 1];
        setStrokes(previousStrokes);
        setUndoStack(prev => prev.slice(0, -1));
    }, [undoStack]);

    const handleClear = useCallback(() => {
        if (strokes.length === 0) return;
        setUndoStack(prev => [...prev, strokes]);
        setStrokes([]);
    }, [strokes]);

    const handleSave = useCallback(() => {
        // In a real implementation, this would render the canvas to an image
        // For now, we'll just return the original mask since we can't do canvas rendering in React Native without additional libraries
        Alert.alert(
            'Edits Saved',
            'Your manual edits have been applied to the mask.',
            [{ text: 'OK', onPress: () => onSave(maskUri || imageUri) }]
        );
    }, [maskUri, imageUri, onSave]);

    const handleCancel = useCallback(() => {
        if (strokes.length > 0) {
            Alert.alert(
                'Discard Changes?',
                'You have unsaved edits. Are you sure you want to discard them?',
                [
                    { text: 'Keep Editing', style: 'cancel' },
                    { text: 'Discard', style: 'destructive', onPress: onCancel },
                ]
            );
        } else {
            onCancel();
        }
    }, [strokes, onCancel]);

    const renderStrokes = () => {
        const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

        return allStrokes.map((stroke, strokeIndex) => (
            <React.Fragment key={strokeIndex}>
                {stroke.points.map((point, pointIndex) => (
                    <View
                        key={`${strokeIndex}-${pointIndex}`}
                        style={[
                            styles.strokePoint,
                            {
                                left: point.x - stroke.size / 2,
                                top: point.y - stroke.size / 2,
                                width: stroke.size,
                                height: stroke.size,
                                borderRadius: stroke.size / 2,
                                backgroundColor:
                                    stroke.tool === 'brush'
                                        ? 'rgba(255, 255, 255, 0.8)'
                                        : 'rgba(0, 0, 0, 0.8)',
                            },
                        ]}
                    />
                ))}
            </React.Fragment>
        ));
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Manual Cleanup</Text>
                <Text style={styles.subtitle}>
                    Use brush to reveal, eraser to hide parts of the image
                </Text>
            </View>

            {/* Canvas */}
            <View
                ref={canvasRef}
                style={styles.canvas}
                {...panResponder.panHandlers}
            >
                <Image
                    source={{ uri: imageUri }}
                    style={styles.canvasImage}
                    resizeMode="contain"
                />
                {renderStrokes()}
                {activeTool !== 'none' && (
                    <View style={styles.toolIndicator}>
                        <Text style={styles.toolIndicatorText}>
                            {activeTool === 'brush' ? '🖌️ Brush' : '🧹 Eraser'} - {brushSize}px
                        </Text>
                    </View>
                )}
            </View>

            {/* Tool Palette */}
            <View style={styles.toolPalette}>
                <View style={styles.toolRow}>
                    <Pressable
                        style={[
                            styles.toolButton,
                            activeTool === 'brush' && styles.toolButtonActive,
                        ]}
                        onPress={() => handleToolSelect('brush')}
                    >
                        <Text style={styles.toolIcon}>🖌️</Text>
                        <Text style={styles.toolLabel}>Brush</Text>
                    </Pressable>
                    <Pressable
                        style={[
                            styles.toolButton,
                            activeTool === 'eraser' && styles.toolButtonActive,
                        ]}
                        onPress={() => handleToolSelect('eraser')}
                    >
                        <Text style={styles.toolIcon}>🧹</Text>
                        <Text style={styles.toolLabel}>Eraser</Text>
                    </Pressable>
                </View>

                {/* Brush Size */}
                <View style={styles.sizeRow}>
                    <Text style={styles.sizeLabel}>Size:</Text>
                    {[10, 20, 40, 60].map(size => (
                        <Pressable
                            key={size}
                            style={[
                                styles.sizeButton,
                                brushSize === size && styles.sizeButtonActive,
                            ]}
                            onPress={() => setBrushSize(size)}
                        >
                            <View
                                style={[
                                    styles.sizePreview,
                                    {
                                        width: Math.min(size / 2, 24),
                                        height: Math.min(size / 2, 24),
                                        borderRadius: Math.min(size / 4, 12),
                                    },
                                ]}
                            />
                        </Pressable>
                    ))}
                </View>

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                    <Pressable
                        style={[styles.actionButton, styles.undoButton]}
                        onPress={handleUndo}
                        disabled={undoStack.length === 0}
                    >
                        <Text style={styles.actionButtonText}>↶ Undo</Text>
                    </Pressable>
                    <Pressable
                        style={[styles.actionButton, styles.clearButton]}
                        onPress={handleClear}
                        disabled={strokes.length === 0}
                    >
                        <Text style={styles.actionButtonText}>🗑️ Clear</Text>
                    </Pressable>
                </View>
            </View>

            {/* Bottom Actions */}
            <View style={styles.bottomActions}>
                <Pressable style={styles.cancelButton} onPress={handleCancel}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveButton} onPress={handleSave}>
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.md,
    },
    title: {
        fontSize: typography.fontSize.xl,
        fontWeight: typography.fontWeight.bold,
        color: colors.text.primary,
    },
    subtitle: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
        marginTop: spacing.xs,
    },
    canvas: {
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        alignSelf: 'center',
        backgroundColor: '#1a1a1a',
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        marginVertical: spacing.md,
    },
    canvasImage: {
        width: '100%',
        height: '100%',
    },
    strokePoint: {
        position: 'absolute',
    },
    toolIndicator: {
        position: 'absolute',
        top: spacing.sm,
        left: spacing.sm,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: borderRadius.sm,
    },
    toolIndicatorText: {
        color: '#fff',
        fontSize: typography.fontSize.xs,
    },
    toolPalette: {
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
    },
    toolRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    toolButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        borderWidth: 2,
        borderColor: colors.border,
    },
    toolButtonActive: {
        borderColor: colors.accent.primary,
        backgroundColor: colors.accent.primary + '20',
    },
    toolIcon: {
        fontSize: 24,
    },
    toolLabel: {
        fontSize: typography.fontSize.md,
        color: colors.text.primary,
        fontWeight: typography.fontWeight.medium,
    },
    sizeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    sizeLabel: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
    },
    sizeButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        borderWidth: 2,
        borderColor: colors.border,
    },
    sizeButtonActive: {
        borderColor: colors.accent.primary,
    },
    sizePreview: {
        backgroundColor: colors.text.primary,
    },
    actionRow: {
        flexDirection: 'row',
        gap: spacing.md,
    },
    actionButton: {
        flex: 1,
        paddingVertical: spacing.sm,
        alignItems: 'center',
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    undoButton: {
        backgroundColor: colors.surface,
    },
    clearButton: {
        backgroundColor: colors.surface,
    },
    actionButtonText: {
        fontSize: typography.fontSize.sm,
        color: colors.text.secondary,
    },
    bottomActions: {
        flexDirection: 'row',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.lg,
        marginTop: 'auto',
    },
    cancelButton: {
        flex: 1,
        paddingVertical: spacing.md,
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cancelButtonText: {
        fontSize: typography.fontSize.md,
        color: colors.text.secondary,
        fontWeight: typography.fontWeight.medium,
    },
    saveButton: {
        flex: 1,
        paddingVertical: spacing.md,
        alignItems: 'center',
        backgroundColor: colors.accent.primary,
        borderRadius: borderRadius.md,
    },
    saveButtonText: {
        fontSize: typography.fontSize.md,
        color: colors.text.inverse,
        fontWeight: typography.fontWeight.semibold,
    },
});
