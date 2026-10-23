import groovy.lang.GroovyShell;
import java.io.File;
import org.codehaus.groovy.control.CompilationFailedException;
import org.codehaus.groovy.control.CompilerConfiguration;

/**
 * Parses (compiles, never executes) Jenkinsfiles and shared library steps with
 * the Groovy compiler to catch syntax errors without a Jenkins controller.
 *
 * Run with the Java single-file source launcher:
 *   java -cp groovy.jar scripts/legacy/GroovyParseCheck.java legacy/Jenkinsfile legacy/shared-library/vars/*.groovy
 *
 * Declarative-specific rules (unknown directives, misplaced "when", etc.) are
 * NOT checked here; see docs/adr/0002-jenkinsfile-validation-strategy.md.
 */
public class GroovyParseCheck {
    public static void main(String[] args) {
        if (args.length == 0) {
            System.err.println("usage: GroovyParseCheck <file>...");
            System.exit(2);
        }
        int failures = 0;
        for (String path : args) {
            File file = new File(path);
            try {
                CompilerConfiguration config = new CompilerConfiguration();
                config.setTolerance(0);
                new GroovyShell(config).parse(file);
                System.out.println("PASS  " + path);
            } catch (CompilationFailedException e) {
                failures++;
                System.out.println("FAIL  " + path);
                System.out.println(e.getMessage());
            } catch (Exception e) {
                failures++;
                System.out.println("ERROR " + path + ": " + e);
            }
        }
        System.out.println(failures == 0 ? "All files parsed successfully." : failures + " file(s) failed to parse.");
        System.exit(failures == 0 ? 0 : 1);
    }
}
