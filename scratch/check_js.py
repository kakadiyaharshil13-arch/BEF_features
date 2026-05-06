import sys

def check_syntax(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    # This is a very basic check, but it can catch some things if we had a JS parser.
    # Since we don't have a JS parser, I'll just check for mismatched braces.
    stack = []
    for i, char in enumerate(content):
        if char == '{': stack.append(('{', i))
        elif char == '}':
            if not stack:
                print(f"Extra closing brace at position {i}")
                return
            stack.pop()
        elif char == '(': stack.append(('(', i))
        elif char == ')':
            if not stack:
                print(f"Extra closing parenthesis at position {i}")
                return
            stack.pop()
    if stack:
        for item, pos in stack:
            print(f"Unclosed {item} starting at position {pos}")
    else:
        print("Braces and parentheses are balanced.")

if __name__ == "__main__":
    check_syntax(sys.argv[1])
