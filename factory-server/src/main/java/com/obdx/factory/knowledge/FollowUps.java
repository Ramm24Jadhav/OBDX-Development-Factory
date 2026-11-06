package com.obdx.factory.knowledge;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "Ask next": the two or three short follow-up questions the model writes after its answer, in a block that starts
 * with a marker line. The block is taken off the answer: the page shows the questions as buttons under the answer and
 * never the marker. Without a block, or with one that holds no usable question, there are no follow-ups.
 */
final class FollowUps {

    static final String MARKER = "<<ask-next>>";

    /** The instruction added to the answer's: the block after the answer, in a fixed form. */
    static final String INSTRUCTION = """
            After the answer, write a line with only %s on it, then two or three short questions the user could ask \
            next about this topic, one per line, each under 12 words, without numbers or citations. Write nothing after \
            them.""".formatted(MARKER);

    // The marker as models write it: any case, spaces or a space for the dash
    private static final Pattern FOUND = Pattern.compile("<<\\s*ask[\\s_-]*next\\s*>>", Pattern.CASE_INSENSITIVE);
    // The longest a marker can be as written, while it is still being streamed
    private static final int LONGEST = 24;
    private static final int MAX = 3;
    private static final int MAX_CHARS = 140;

    /** An answer without its follow-up block, and the questions from it (empty when there are none). */
    record Split(String answer, List<String> questions) {
    }

    private FollowUps() {
    }

    /** Takes the follow-up block off a whole answer. */
    static Split split(String reply) {
        String text = reply == null ? "" : reply;
        Matcher m = FOUND.matcher(text);
        if (!m.find()) {
            return new Split(text, List.of());
        }
        // Markdown marks the model put around the marker ("**<<ask-next>>**", "## <<ask-next>>") go with it
        String answer = text.substring(0, m.start()).replaceAll("[\\s*_#>]+$", "");
        return new Split(answer, questions(text.substring(m.end())));
    }

    private static List<String> questions(String block) {
        List<String> out = new ArrayList<>();
        for (String line : block.split("\\R")) {
            String q = line.strip()
                    .replaceFirst("^([-*+•]|\\d{1,2}[.)])\\s+", "")
                    .replaceAll("\\[\\d{1,2}]", "")
                    .replaceAll("\\*\\*|__|`", "")
                    .replaceAll("^[\"'“]+|[\"'”]+$", "")
                    .strip();
            if (q.isEmpty() || q.startsWith("<<") || q.length() > MAX_CHARS || !q.chars().anyMatch(Character::isLetter)) {
                continue;
            }
            if (out.stream().noneMatch(x -> x.toLowerCase(Locale.ROOT).equals(q.toLowerCase(Locale.ROOT)))) {
                out.add(q);
            }
            if (out.size() == MAX) {
                break;
            }
        }
        return List.copyOf(out);
    }

    /**
     * Passes the pieces of a streamed answer on without the follow-up block: text that could be the start of the marker
     * is held back until the next piece shows whether it is, and everything from the marker on is dropped. Call
     * {@link #finish()} when the model has finished, to pass on what is still held.
     */
    static final class Stream implements Consumer<String> {
        private final Consumer<String> next;
        private final StringBuilder held = new StringBuilder();
        private boolean ended;

        Stream(Consumer<String> next) {
            this.next = next;
        }

        @Override
        public void accept(String piece) {
            if (ended || piece == null || piece.isEmpty()) {
                return;
            }
            held.append(piece);
            Matcher m = FOUND.matcher(held);
            if (m.find()) {
                pass(held.substring(0, m.start()));
                held.setLength(0);
                ended = true;
                return;
            }
            int keep = heldBack();
            pass(held.substring(0, held.length() - keep));
            held.delete(0, held.length() - keep);
        }

        /** Passes on what is still held: the model ended without a follow-up block. */
        void finish() {
            if (!ended) {
                pass(held.toString());
                held.setLength(0);
                ended = true;
            }
        }

        // How much of the end of the held text could be a marker still being written: from a "<" near the end
        private int heldBack() {
            int from = Math.max(0, held.length() - LONGEST);
            for (int i = from; i < held.length(); i++) {
                if (held.charAt(i) == '<' && (i + 1 == held.length() || held.charAt(i + 1) == '<')) {
                    return held.length() - i;
                }
            }
            return 0;
        }

        private void pass(String text) {
            if (!text.isEmpty()) {
                next.accept(text);
            }
        }
    }
}
