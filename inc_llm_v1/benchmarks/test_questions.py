"""Shared test data for benchmarks — questions, coding tasks, conversations."""

from __future__ import annotations

# ─── Knowledge Questions (20 across RAG domains) ──────────────────────────────

KNOWLEDGE_QUESTIONS: list[dict[str, str | list[str]]] = [
    {
        "question": "What is the time complexity of binary search?",
        "expected_keywords": ["o(log n)", "log", "sorted"],
        "domain": "algorithms",
    },
    {
        "question": "What does ACID stand for in database transactions?",
        "expected_keywords": ["atomicity", "consistency", "isolation", "durability"],
        "domain": "databases",
    },
    {
        "question": "What is a closure in JavaScript?",
        "expected_keywords": ["function", "scope", "variables", "inner"],
        "domain": "javascript",
    },
    {
        "question": "What is the difference between TCP and UDP?",
        "expected_keywords": ["connection", "reliable", "unordered", "datagram"],
        "domain": "networking",
    },
    {
        "question": "What is a smart contract in blockchain?",
        "expected_keywords": ["self-executing", "code", "blockchain", "agreement"],
        "domain": "blockchain",
    },
    {
        "question": "What is gradient descent in machine learning?",
        "expected_keywords": ["optimization", "loss", "learning rate", "minimum"],
        "domain": "ai_ml",
    },
    {
        "question": "What is the CAP theorem in distributed systems?",
        "expected_keywords": ["consistency", "availability", "partition", "tolerance"],
        "domain": "distributed_systems",
    },
    {
        "question": "What is a Docker container?",
        "expected_keywords": ["isolated", "environment", "image", "portable"],
        "domain": "devops",
    },
    {
        "question": "What is RSA encryption?",
        "expected_keywords": ["public key", "private key", "asymmetric", "factorization"],
        "domain": "security",
    },
    {
        "question": "What is the Pythagorean theorem?",
        "expected_keywords": ["a squared", "b squared", "c squared", "right triangle", "hypotenuse"],
        "domain": "mathematics",
    },
    {
        "question": "What is a REST API?",
        "expected_keywords": ["representational", "state", "transfer", "http", "resource"],
        "domain": "web_development",
    },
    {
        "question": "What is the difference between Python lists and tuples?",
        "expected_keywords": ["mutable", "immutable", "change", "parentheses"],
        "domain": "python",
    },
    {
        "question": "What is recursion in programming?",
        "expected_keywords": ["calls itself", "base case", "function", "stack"],
        "domain": "algorithms",
    },
    {
        "question": "What is a neural network?",
        "expected_keywords": ["neurons", "layers", "weights", "activation"],
        "domain": "ai_ml",
    },
    {
        "question": "What is Kubernetes used for?",
        "expected_keywords": ["container", "orchestration", "cluster", "scaling"],
        "domain": "devops",
    },
    {
        "question": "What is SQL injection?",
        "expected_keywords": ["input", "query", "malicious", "database", "attack"],
        "domain": "security",
    },
    {
        "question": "What is the difference between async and sync programming?",
        "expected_keywords": ["blocking", "non-blocking", "concurrent", "await"],
        "domain": "programming",
    },
    {
        "question": "What is a hash table?",
        "expected_keywords": ["key", "value", "hash", "bucket", "o(1)"],
        "domain": "data_structures",
    },
    {
        "question": "What is CI/CD?",
        "expected_keywords": ["continuous", "integration", "deployment", "pipeline", "automation"],
        "domain": "devops",
    },
    {
        "question": "What is the halting problem?",
        "expected_keywords": ["turing", "undecidable", "terminates", "impossible"],
        "domain": "theory",
    },
]

# ─── Coding Tasks (10) ────────────────────────────────────────────────────────

CODING_TASKS: list[dict[str, str]] = [
    {
        "prompt": "Write a Python function called `is_palindrome` that checks if a string is a palindrome. Return True or False.",
        "test_code": "assert is_palindrome('racecar') == True; assert is_palindrome('hello') == False; assert is_palindrome('') == True; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `fibonacci` that returns the nth Fibonacci number using iteration.",
        "test_code": "assert fibonacci(0) == 0; assert fibonacci(1) == 1; assert fibonacci(10) == 55; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `reverse_string` that reverses a string without using built-in reverse.",
        "test_code": "assert reverse_string('hello') == 'olleh'; assert reverse_string('') == ''; assert reverse_string('a') == 'a'; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `factorial` that computes n! iteratively.",
        "test_code": "assert factorial(0) == 1; assert factorial(5) == 120; assert factorial(1) == 1; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `count_vowels` that counts vowels in a string.",
        "test_code": "assert count_vowels('hello') == 2; assert count_vowels('AEIOU') == 5; assert count_vowels('xyz') == 0; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `binary_search` that searches a sorted list and returns the index or -1.",
        "test_code": "assert binary_search([1,2,3,4,5], 3) == 2; assert binary_search([1,2,3,4,5], 6) == -1; assert binary_search([], 1) == -1; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `merge_sorted` that merges two sorted lists into one sorted list.",
        "test_code": "assert merge_sorted([1,3,5], [2,4,6]) == [1,2,3,4,5,6]; assert merge_sorted([], [1]) == [1]; assert merge_sorted([1], []) == [1]; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `is_valid_parentheses` that checks if parentheses are balanced.",
        "test_code": "assert is_valid_parentheses('()') == True; assert is_valid_parentheses('(()') == False; assert is_valid_parentheses('(())') == True; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `max_subarray_sum` that finds the maximum subarray sum (Kadane's algorithm).",
        "test_code": "assert max_subarray_sum([-1,2,3,-1,4]) == 8; assert max_subarray_sum([-1,-2,-3]) == -1; assert max_subarray_sum([1]) == 1; print('PASS')",
        "expected_output": "PASS",
    },
    {
        "prompt": "Write a Python function called `flatten_list` that flattens a nested list one level deep.",
        "test_code": "assert flatten_list([[1,2],[3,4],[5]]) == [1,2,3,4,5]; assert flatten_list([]) == []; assert flatten_list([[1]]) == [1]; print('PASS')",
        "expected_output": "PASS",
    },
]

# ─── Multi-turn Conversations (5) ────────────────────────────────────────────

MULTI_TURN_CONVERSATIONS: list[list[dict[str, str]]] = [
    [
        {"role": "user", "content": "My name is Alice and I like Python programming."},
        {"role": "user", "content": "What programming language did I say I like?"},
        {"role": "user", "content": "What is my name?"},
    ],
    [
        {"role": "user", "content": "I'm building a REST API with FastAPI. It needs user authentication."},
        {"role": "user", "content": "What framework am I using?"},
        {"role": "user", "content": "What feature did I say I need?"},
    ],
    [
        {"role": "user", "content": "I have a list of numbers: [5, 3, 8, 1, 9, 2]."},
        {"role": "user", "content": "What is the largest number in my list?"},
        {"role": "user", "content": "What is the smallest number in my list?"},
    ],
    [
        {"role": "user", "content": "I'm learning about Docker. I want to containerize a Python app."},
        {"role": "user", "content": "What technology am I learning about?"},
        {"role": "user", "content": "What language is my app written in?"},
    ],
    [
        {"role": "user", "content": "I prefer functional programming over object-oriented programming."},
        {"role": "user", "content": "Which programming paradigm do I prefer?"},
        {"role": "user", "content": "Which paradigm do I like less?"},
    ],
]

# ─── Cross-model test questions (subset for quick comparison) ─────────────────

CROSS_MODEL_QUESTIONS: list[dict[str, str | list[str]]] = [
    {
        "question": "What is the time complexity of quicksort?",
        "expected_keywords": ["o(n log n)", "n log n", "average", "worst", "o(n^2)"],
    },
    {
        "question": "Explain what a Python decorator does.",
        "expected_keywords": ["function", "wrapper", "modify", "before", "after"],
    },
    {
        "question": "What is the difference between SQL and NoSQL databases?",
        "expected_keywords": ["relational", "structured", "flexible", "schema", "document"],
    },
    {
        "question": "Write a one-line Python function to check if a number is even.",
        "expected_keywords": ["lambda", "n % 2", "== 0", "return"],
    },
    {
        "question": "What is the purpose of the 'finally' block in Python exception handling?",
        "expected_keywords": ["cleanup", "always", "execute", "regardless", "exception"],
    },
    {
        "question": "What does HTTP status code 404 mean?",
        "expected_keywords": ["not found", "resource"],
    },
    {
        "question": "What is the difference between == and === in JavaScript?",
        "expected_keywords": ["value", "type", "strict", "coercion"],
    },
    {
        "question": "What is a primary key in a database?",
        "expected_keywords": ["unique", "identifier", "row", "table"],
    },
    {
        "question": "What is the Big O of accessing an element in a hash map?",
        "expected_keywords": ["o(1)", "constant"],
    },
    {
        "question": "What does the 'git merge' command do?",
        "expected_keywords": ["combine", "branch", "integrate", "commits"],
    },
]
